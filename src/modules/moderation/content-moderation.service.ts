import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationService } from './moderation.service';
import {
  ModerationContentType,
  ModerationSource,
  ModerationCategory,
} from '../../database/entities/moderation-queue.entity';

export interface ModerationResult {
  shouldFlag: boolean;
  score: number;
  category?: ModerationCategory;
  flaggedTerms?: string[];
  aiDetails?: {
    category: string;
    confidence: number;
    flaggedTerms?: string[];
  };
}

@Injectable()
export class ContentModerationService {
  private readonly logger = new Logger(ContentModerationService.name);
  private readonly aiEndpoint: string;
  private readonly aiKey: string;
  private readonly isAiEnabled: boolean;

  // Keyword blacklist - severity levels: 1 = low, 2 = medium, 3 = high
  private readonly keywordBlacklist: Map<string, { severity: number; category: ModerationCategory }> = new Map([
    // Violence
    ['kill', { severity: 2, category: ModerationCategory.VIOLENCE }],
    ['murder', { severity: 3, category: ModerationCategory.VIOLENCE }],
    ['bomb', { severity: 3, category: ModerationCategory.VIOLENCE }],
    ['terrorist', { severity: 3, category: ModerationCategory.VIOLENCE }],
    ['attack', { severity: 1, category: ModerationCategory.VIOLENCE }],

    // Hate speech
    ['racist', { severity: 2, category: ModerationCategory.HATE_SPEECH }],
    ['bigot', { severity: 2, category: ModerationCategory.HATE_SPEECH }],

    // Scam indicators
    ['send money', { severity: 2, category: ModerationCategory.SCAM }],
    ['wire transfer', { severity: 2, category: ModerationCategory.SCAM }],
    ['western union', { severity: 2, category: ModerationCategory.SCAM }],
    ['advance fee', { severity: 3, category: ModerationCategory.SCAM }],
    ['nigerian prince', { severity: 3, category: ModerationCategory.SCAM }],
    ['get rich quick', { severity: 2, category: ModerationCategory.SCAM }],
    ['investment opportunity', { severity: 1, category: ModerationCategory.SCAM }],
    ['guaranteed returns', { severity: 2, category: ModerationCategory.SCAM }],

    // Spam
    ['click here', { severity: 1, category: ModerationCategory.SPAM }],
    ['buy now', { severity: 1, category: ModerationCategory.SPAM }],
    ['limited offer', { severity: 1, category: ModerationCategory.SPAM }],
    ['act now', { severity: 1, category: ModerationCategory.SPAM }],

    // Adult content
    ['xxx', { severity: 2, category: ModerationCategory.ADULT_CONTENT }],
    ['nsfw', { severity: 2, category: ModerationCategory.ADULT_CONTENT }],
    ['porn', { severity: 3, category: ModerationCategory.ADULT_CONTENT }],

    // Personal information (PII)
    ['my bank account', { severity: 2, category: ModerationCategory.PERSONAL_INFO }],
    ['credit card number', { severity: 3, category: ModerationCategory.PERSONAL_INFO }],
    ['social security', { severity: 3, category: ModerationCategory.PERSONAL_INFO }],
  ]);

  // Regex patterns for additional detection
  private readonly patterns = [
    // Phone numbers (Nigerian format)
    {
      pattern: /\b(0[7-9][0-1]\d{8}|\+234[7-9][0-1]\d{8})\b/g,
      category: ModerationCategory.PERSONAL_INFO,
      severity: 1,
      description: 'phone number',
    },
    // Bank account numbers
    {
      pattern: /\b\d{10}\b/g,
      category: ModerationCategory.PERSONAL_INFO,
      severity: 1,
      description: 'potential bank account',
    },
    // Multiple exclamation marks (spam indicator)
    {
      pattern: /!{3,}/g,
      category: ModerationCategory.SPAM,
      severity: 1,
      description: 'excessive punctuation',
    },
    // All caps words (spam/aggressive)
    {
      pattern: /\b[A-Z]{5,}\b/g,
      category: ModerationCategory.SPAM,
      severity: 1,
      description: 'excessive caps',
    },
    // URLs (might be phishing)
    {
      pattern: /https?:\/\/[^\s]+/g,
      category: ModerationCategory.SPAM,
      severity: 1,
      description: 'contains URL',
    },
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly moderationService: ModerationService,
  ) {
    this.aiEndpoint = this.configService.get<string>('CONTENT_MODERATOR_ENDPOINT', '');
    this.aiKey = this.configService.get<string>('CONTENT_MODERATOR_KEY', '');
    this.isAiEnabled = Boolean(this.aiEndpoint && this.aiKey);

    if (!this.isAiEnabled) {
      this.logger.warn('AI content moderation is disabled. Using keyword-based moderation only.');
    }
  }

  /**
   * Moderate content before it's published (pre-moderation)
   */
  async moderateContent(
    content: string,
    contentType: ModerationContentType,
    contentId: string,
    userId: string,
  ): Promise<ModerationResult> {
    const keywordResult = this.checkKeywords(content);
    const patternResult = this.checkPatterns(content);

    let aiResult: ModerationResult | null = null;
    if (this.isAiEnabled) {
      aiResult = await this.checkWithAI(content);
    }

    // Combine results
    const combinedScore = this.calculateCombinedScore(keywordResult, patternResult, aiResult);
    const flaggedTerms = [
      ...(keywordResult.flaggedTerms || []),
      ...(patternResult.flaggedTerms || []),
      ...(aiResult?.flaggedTerms || []),
    ];

    const shouldFlag = combinedScore >= 0.5; // Flag if score >= 50%

    if (shouldFlag) {
      // Add to moderation queue
      const source = aiResult && aiResult.score > 0.5
        ? ModerationSource.AI_FLAG
        : ModerationSource.KEYWORD_FLAG;

      const category = aiResult?.category || keywordResult.category || patternResult.category;

      await this.moderationService.addToModerationQueue(
        contentType,
        contentId,
        userId,
        source,
        {
          category,
          aiScore: aiResult?.score,
          aiDetails: aiResult?.aiDetails,
          flaggedKeywords: flaggedTerms.length > 0 ? flaggedTerms : undefined,
          contentSnapshot: content.substring(0, 1000), // Store first 1000 chars
          priority: this.calculatePriority(combinedScore, category),
        },
      );
    }

    return {
      shouldFlag,
      score: combinedScore,
      category: aiResult?.category || keywordResult.category || patternResult.category,
      flaggedTerms,
      aiDetails: aiResult?.aiDetails,
    };
  }

  /**
   * Check content against keyword blacklist
   */
  private checkKeywords(content: string): ModerationResult {
    const lowerContent = content.toLowerCase();
    const flaggedTerms: string[] = [];
    let maxSeverity = 0;
    let category: ModerationCategory | undefined;

    for (const [keyword, info] of this.keywordBlacklist) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        flaggedTerms.push(keyword);
        if (info.severity > maxSeverity) {
          maxSeverity = info.severity;
          category = info.category;
        }
      }
    }

    // Convert severity to score (0-1)
    const score = maxSeverity / 3;

    return {
      shouldFlag: score >= 0.5,
      score,
      category,
      flaggedTerms,
    };
  }

  /**
   * Check content against regex patterns
   */
  private checkPatterns(content: string): ModerationResult {
    const flaggedTerms: string[] = [];
    let maxSeverity = 0;
    let category: ModerationCategory | undefined;

    for (const { pattern, severity, description, category: patternCategory } of this.patterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        flaggedTerms.push(`${description} (${matches.length} found)`);
        if (severity > maxSeverity) {
          maxSeverity = severity;
          category = patternCategory;
        }
      }
    }

    const score = maxSeverity / 3;

    return {
      shouldFlag: score >= 0.5,
      score,
      category,
      flaggedTerms,
    };
  }

  /**
   * Check content with AI moderation service (Azure Content Moderator / OpenAI)
   */
  private async checkWithAI(content: string): Promise<ModerationResult | null> {
    if (!this.isAiEnabled) {
      return null;
    }

    try {
      // This is a placeholder for actual AI integration
      // You would implement the actual API call based on your chosen service
      // For Azure Content Moderator:
      const response = await fetch(this.aiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Ocp-Apim-Subscription-Key': this.aiKey,
        },
        body: JSON.stringify({ text: content }),
      });

      if (!response.ok) {
        this.logger.error(`AI moderation failed: ${response.status}`);
        return null;
      }

      const result = await response.json();

      // Parse the AI response - this structure varies by service
      // Example structure for Azure Content Moderator
      const categories = result.Categories || {};
      const highestCategory = this.getHighestCategory(categories);

      return {
        shouldFlag: result.IsHighSeverityContent || false,
        score: highestCategory?.score || 0,
        category: this.mapAiCategory(highestCategory?.name),
        aiDetails: {
          category: highestCategory?.name || 'unknown',
          confidence: highestCategory?.score || 0,
          flaggedTerms: result.Terms?.map((t: any) => t.Term) || [],
        },
        flaggedTerms: result.Terms?.map((t: any) => t.Term) || [],
      };
    } catch (error) {
      this.logger.error(`AI moderation error: ${error}`);
      return null;
    }
  }

  /**
   * Calculate combined moderation score
   */
  private calculateCombinedScore(
    keywordResult: ModerationResult,
    patternResult: ModerationResult,
    aiResult: ModerationResult | null,
  ): number {
    // Weight the scores
    const keywordWeight = 0.3;
    const patternWeight = 0.2;
    const aiWeight = 0.5;

    if (aiResult) {
      return (
        keywordResult.score * keywordWeight +
        patternResult.score * patternWeight +
        aiResult.score * aiWeight
      );
    }

    // Without AI, reweight
    return (
      keywordResult.score * 0.6 +
      patternResult.score * 0.4
    );
  }

  /**
   * Calculate priority for moderation queue
   */
  private calculatePriority(score: number, category?: ModerationCategory): number {
    let basePriority = Math.round(score * 100);

    // Boost priority for certain categories
    if (category) {
      const highPriorityCategories = [
        ModerationCategory.VIOLENCE,
        ModerationCategory.ADULT_CONTENT,
      ];
      const mediumPriorityCategories = [
        ModerationCategory.HATE_SPEECH,
        ModerationCategory.HARASSMENT,
        ModerationCategory.SCAM,
      ];

      if (highPriorityCategories.includes(category)) {
        basePriority = Math.min(100, basePriority + 20);
      } else if (mediumPriorityCategories.includes(category)) {
        basePriority = Math.min(100, basePriority + 10);
      }
    }

    return basePriority;
  }

  /**
   * Get the highest scoring category from AI results
   */
  private getHighestCategory(categories: Record<string, number>): { name: string; score: number } | null {
    let highest: { name: string; score: number } | null = null;

    for (const [name, score] of Object.entries(categories)) {
      if (!highest || score > highest.score) {
        highest = { name, score };
      }
    }

    return highest;
  }

  /**
   * Map AI category to our internal category enum
   */
  private mapAiCategory(aiCategory?: string): ModerationCategory | undefined {
    if (!aiCategory) return undefined;

    const mapping: Record<string, ModerationCategory> = {
      'Hate': ModerationCategory.HATE_SPEECH,
      'SelfHarm': ModerationCategory.VIOLENCE,
      'Sexual': ModerationCategory.ADULT_CONTENT,
      'Violence': ModerationCategory.VIOLENCE,
      'HateThreatening': ModerationCategory.HATE_SPEECH,
      'SelfHarmIntent': ModerationCategory.VIOLENCE,
      'SexualMinors': ModerationCategory.ADULT_CONTENT,
      'ViolenceGraphic': ModerationCategory.VIOLENCE,
    };

    return mapping[aiCategory] || ModerationCategory.OTHER;
  }

  /**
   * Quick check if content likely needs moderation (for sync operations)
   */
  quickCheck(content: string): boolean {
    const keywordResult = this.checkKeywords(content);
    if (keywordResult.score >= 0.7) return true;

    const patternResult = this.checkPatterns(content);
    if (patternResult.score >= 0.7) return true;

    return false;
  }
}
