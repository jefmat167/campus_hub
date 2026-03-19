import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { SocialService } from './social.service';
import {
  CreatePostDto,
  CreateCommentDto,
  ReactToPostDto,
  VotePollDto,
  FeedQueryDto,
  FeedFilterType,
} from './dto';

@ApiTags('Social (Anonymous Forum)')
@Controller('social')
@UseGuards(JwtAuthGuard, TierGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  /**
   * Create a new anonymous post
   */
  @Post('posts')
  @ApiOperation({ summary: 'Create anonymous post', description: 'Create a new anonymous post visible to your university/faculty/department' })
  @ApiResponse({ status: 201, description: 'Post created successfully' })
  async createPost(@CurrentUser() user: User, @Body() dto: CreatePostDto) {
    const post = await this.socialService.createPost(
      user.id,
      user.universityId,
      user.facultyId,
      user.departmentId,
      dto,
    );

    return {
      success: true,
      data: this.sanitizePost(post, user.id),
      message: 'Post created successfully',
    };
  }

  /**
   * Get posts feed
   */
  @Get('posts')
  @ApiOperation({
    summary: 'Get posts feed',
    description:
      'Returns a paginated feed of anonymous posts within the user\'s university scope. ' +
      'Posts are filtered based on visibility (university/faculty/department) and can be ' +
      'sorted by recent or trending. Supports filtering by polls, images, visibility scope, and time period.',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'Pagination cursor (timestamp for recent sort, score for trending)',
    example: '2024-01-20T10:30:00.000Z',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of posts to return (default: 20)',
    example: 20,
    type: Number,
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['recent', 'trending'],
    description: 'Sort order - recent (newest first) or trending (by engagement score)',
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    enum: ['polls'],
    description: 'Filter by post type (polls = only posts with polls)',
  })
  @ApiQuery({
    name: 'visibility',
    required: false,
    enum: ['university', 'faculty', 'department'],
    description: 'Filter by visibility scope (e.g., show only university-wide posts)',
  })
  @ApiQuery({
    name: 'hasImages',
    required: false,
    type: Boolean,
    description: 'Filter to show only posts with images (true) or without images (false)',
    example: true,
  })
  @ApiQuery({
    name: 'since',
    required: false,
    enum: ['24h', '7d', '30d'],
    description: 'Filter posts by time period (24h = last day, 7d = last week, 30d = last month)',
  })
  @ApiResponse({
    status: 200,
    description: 'Posts retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            anonymousId: 'Anon-7F3A',
            isOP: false,
            visibility: 'university',
            content: 'Does anyone know when the library closes during exam week?',
            imageUrls: [],
            poll: null,
            reactions: [
              { type: 'like', count: 12, hasReacted: false },
              { type: 'love', count: 3, hasReacted: true },
            ],
            totalReactions: 15,
            commentCount: 8,
            viewCount: 124,
            isEdited: false,
            createdAt: '2024-01-20T10:30:00.000Z',
            updatedAt: '2024-01-20T10:30:00.000Z',
          },
        ],
        meta: {
          nextCursor: '2024-01-19T15:20:00.000Z',
          hasMore: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_0 verification requirement',
  })
  async getFeed(@CurrentUser() user: User, @Query() query: FeedQueryDto) {
    const { posts, nextCursor } = await this.socialService.getFeed(
      user.universityId,
      user.facultyId,
      user.departmentId,
      {
        cursor: query.cursor,
        limit: query.limit || 20,
        sort: query.sort || 'recent',
        pollsOnly: query.filter === FeedFilterType.POLLS,
        visibility: query.visibility,
        hasImages: query.hasImages,
        since: query.since,
      },
    );

    return {
      success: true,
      data: posts.map((post) => this.sanitizePost(post, user.id)),
      meta: {
        nextCursor,
        hasMore: !!nextCursor,
      },
    };
  }

  /**
   * Get trending posts
   */
  @Get('posts/trending')
  @ApiOperation({ summary: 'Get trending posts', description: 'Returns top trending posts from the last 24 hours within the user\'s university, ranked by engagement score.' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of trending posts to return (default: 10)', example: 10, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Trending posts retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            anonymousId: 'Anon-7F3A',
            isOP: false,
            visibility: 'university',
            content: 'The new student center is amazing!',
            imageUrls: [],
            poll: null,
            reactions: [{ type: 'like', count: 45, hasReacted: false }],
            totalReactions: 52,
            commentCount: 23,
            viewCount: 412,
            isEdited: false,
            createdAt: '2026-03-19T08:00:00.000Z',
          },
        ],
      },
    },
  })
  async getTrending(
    @CurrentUser() user: User,
    @Query('limit') limit?: string,
  ) {
    const posts = await this.socialService.getTrending(
      user.universityId,
      Number(limit) || 10,
    );

    return {
      success: true,
      data: posts.map((post) => this.sanitizePost(post, user.id)),
    };
  }

  /**
   * Get user's own posts
   */
  @Get('posts/mine')
  @ApiOperation({ summary: 'Get my posts', description: 'Returns the current user\'s own anonymous posts with cursor-based pagination.' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor (ISO timestamp)', example: '2026-03-19T10:30:00.000Z' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of posts to return (default: 20)', example: 20, type: Number })
  @ApiResponse({
    status: 200,
    description: 'User posts retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            anonymousId: 'Anon-7F3A',
            isOP: true,
            visibility: 'university',
            content: 'The new student center is amazing!',
            imageUrls: [],
            poll: null,
            reactions: [{ type: 'like', count: 45, hasReacted: false }],
            totalReactions: 52,
            commentCount: 23,
            viewCount: 412,
            isEdited: false,
            createdAt: '2026-03-19T08:00:00.000Z',
          },
        ],
        meta: { nextCursor: '2026-03-18T15:20:00.000Z', hasMore: true },
      },
    },
  })
  async getMyPosts(
    @CurrentUser() user: User,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const { posts, nextCursor } = await this.socialService.getUserPosts(
      user.id,
      cursor,
      Number(limit) || 20,
    );

    return {
      success: true,
      data: posts.map((post) => this.sanitizePost(post, user.id, true)),
      meta: {
        nextCursor,
        hasMore: !!nextCursor,
      },
    };
  }

  /**
   * Get a single post
   */
  @Get('posts/:id')
  @ApiOperation({ summary: 'Get a single post', description: 'Returns a single post by ID. Increments the view count.' })
  @ApiParam({ name: 'id', description: 'Post UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Post retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          anonymousId: 'Anon-7F3A',
          isOP: false,
          visibility: 'university',
          content: 'Does anyone know when the library closes during exam week?',
          imageUrls: [],
          poll: null,
          reactions: [
            { type: 'like', count: 12, hasReacted: false },
            { type: 'love', count: 3, hasReacted: true },
          ],
          totalReactions: 15,
          commentCount: 8,
          viewCount: 125,
          isEdited: false,
          createdAt: '2026-03-19T10:30:00.000Z',
        },
      },
    },
  })
  async getPost(@CurrentUser() user: User, @Param('id') id: string) {
    const post = await this.socialService.getPost(id, user.id);

    return {
      success: true,
      data: this.sanitizePost(post, user.id),
    };
  }

  /**
   * React to a post
   */
  @Post('posts/:id/react')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'React to a post', description: 'Toggle a reaction on a post. Sending the same reaction type again removes it. Only one reaction type per user per post.' })
  @ApiParam({ name: 'id', description: 'Post UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Reaction updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          reactions: [
            { type: 'like', count: 13, hasReacted: true },
            { type: 'love', count: 3, hasReacted: false },
          ],
          totalReactions: 16,
        },
        message: 'Reaction updated',
      },
    },
  })
  async reactToPost(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReactToPostDto,
  ) {
    const post = await this.socialService.reactToPost(id, user.id, dto);

    return {
      success: true,
      data: {
        reactions: post.reactions,
        totalReactions: post.totalReactions,
      },
      message: 'Reaction updated',
    };
  }

  /**
   * Vote on a poll
   */
  @Post('posts/:id/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vote on a poll', description: 'Cast a vote on a post\'s poll. Vote counts become visible after voting.' })
  @ApiParam({ name: 'id', description: 'Post UUID (must contain a poll)', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Vote recorded successfully',
    schema: {
      example: {
        success: true,
        data: {
          poll: {
            question: 'What is the best cafeteria on campus?',
            options: [
              { id: 'opt_1', text: 'Main Cafeteria', voteCount: 24, hasVoted: true, percentage: 48 },
              { id: 'opt_2', text: 'Faculty Canteen', voteCount: 18, hasVoted: false, percentage: 36 },
              { id: 'opt_3', text: 'Student Union', voteCount: 8, hasVoted: false, percentage: 16 },
            ],
            allowMultipleVotes: false,
            endsAt: '2026-03-25T23:59:59.000Z',
            isClosed: false,
            totalVotes: 50,
            hasVoted: true,
          },
        },
        message: 'Vote recorded',
      },
    },
  })
  async votePoll(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: VotePollDto,
  ) {
    const post = await this.socialService.votePoll(id, user.id, dto);

    return {
      success: true,
      data: {
        poll: this.sanitizePoll(post.poll, user.id),
      },
      message: 'Vote recorded',
    };
  }

  /**
   * Delete a post
   */
  @Delete('posts/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a post', description: 'Delete your own anonymous post. Only the original author can delete.' })
  @ApiParam({ name: 'id', description: 'Post UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Post deleted successfully',
    schema: {
      example: { success: true, message: 'Post deleted' },
    },
  })
  async deletePost(@CurrentUser() user: User, @Param('id') id: string) {
    await this.socialService.deletePost(id, user.id);

    return {
      success: true,
      message: 'Post deleted',
    };
  }

  /**
   * Get comments for a post
   */
  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'Get comments for a post', description: 'Returns comments for a post with cursor-based pagination. Use parentId to fetch nested replies.' })
  @ApiParam({ name: 'postId', description: 'Post UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiQuery({ name: 'parentId', required: false, description: 'Parent comment UUID to fetch replies for', example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor (ISO timestamp)', example: '2026-03-19T10:30:00.000Z' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of comments to return (default: 20)', example: 20, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Comments retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            postId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            parentId: null,
            anonymousId: 'Anon-3B2C',
            isOP: false,
            content: 'Great question! The library stays open until midnight during exams.',
            reactions: [{ type: 'like', count: 5, hasReacted: false }],
            totalReactions: 5,
            replyCount: 2,
            depth: 0,
            isEdited: false,
            createdAt: '2026-03-19T11:00:00.000Z',
          },
        ],
        meta: { nextCursor: '2026-03-19T10:30:00.000Z', hasMore: true },
      },
    },
  })
  async getComments(
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Query('parentId') parentId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const { comments, nextCursor } = await this.socialService.getComments(
      postId,
      { parentId, cursor, limit: Number(limit) || 20 },
    );

    return {
      success: true,
      data: comments.map((comment) => this.sanitizeComment(comment, user.id)),
      meta: {
        nextCursor,
        hasMore: !!nextCursor,
      },
    };
  }

  /**
   * Create a comment on a post
   */
  @Post('posts/:postId/comments')
  @ApiOperation({ summary: 'Create a comment', description: 'Create an anonymous comment on a post. Use parentId in the body to create a nested reply (max depth 3).' })
  @ApiParam({ name: 'postId', description: 'Post UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 201,
    description: 'Comment created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          postId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          parentId: null,
          anonymousId: 'Anon-3B2C',
          isOP: true,
          content: 'Great question! The library stays open until midnight during exams.',
          reactions: [{ type: 'like', count: 0, hasReacted: false }],
          totalReactions: 0,
          replyCount: 0,
          depth: 0,
          isEdited: false,
          createdAt: '2026-03-19T11:00:00.000Z',
        },
        message: 'Comment created',
      },
    },
  })
  async createComment(
    @CurrentUser() user: User,
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    const comment = await this.socialService.createComment(postId, user.id, dto);

    return {
      success: true,
      data: this.sanitizeComment(comment, user.id, true),
      message: 'Comment created',
    };
  }

  /**
   * React to a comment
   */
  @Post('comments/:id/react')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'React to a comment', description: 'Toggle a reaction on a comment. Sending the same reaction type again removes it.' })
  @ApiParam({ name: 'id', description: 'Comment UUID', example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  @ApiResponse({
    status: 200,
    description: 'Reaction updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          reactions: [{ type: 'like', count: 6, hasReacted: true }],
          totalReactions: 6,
        },
        message: 'Reaction updated',
      },
    },
  })
  async reactToComment(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReactToPostDto,
  ) {
    const comment = await this.socialService.reactToComment(id, user.id, dto);

    return {
      success: true,
      data: {
        reactions: comment.reactions,
        totalReactions: comment.totalReactions,
      },
      message: 'Reaction updated',
    };
  }

  /**
   * Delete a comment
   */
  @Delete('comments/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a comment', description: 'Delete your own anonymous comment. Only the original author can delete.' })
  @ApiParam({ name: 'id', description: 'Comment UUID', example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  @ApiResponse({
    status: 200,
    description: 'Comment deleted successfully',
    schema: {
      example: { success: true, message: 'Comment deleted' },
    },
  })
  async deleteComment(@CurrentUser() user: User, @Param('id') id: string) {
    await this.socialService.deleteComment(id, user.id);

    return {
      success: true,
      message: 'Comment deleted',
    };
  }

  /**
   * Sanitize post for response (remove sensitive data)
   */
  private sanitizePost(post: any, currentUserId: string, isOwner = false): Record<string, unknown> {
    const isMyPost = post.authorId === currentUserId;

    return {
      id: post.id,
      anonymousId: post.anonymousId,
      isOP: isMyPost,
      visibility: post.visibility,
      content: post.content,
      imageUrls: post.imageUrls,
      poll: post.poll ? this.sanitizePoll(post.poll, currentUserId) : null,
      reactions: post.reactions.map((r: any) => ({
        type: r.type,
        count: r.count,
        hasReacted: r.userIds.includes(currentUserId),
      })),
      totalReactions: post.totalReactions,
      commentCount: post.commentCount,
      viewCount: post.viewCount,
      isEdited: post.isEdited,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
    };
  }

  /**
   * Sanitize poll for response
   */
  private sanitizePoll(poll: any, currentUserId: string): Record<string, unknown> | null {
    if (!poll) return null;

    const hasVoted = poll.options.some((opt: any) => opt.voterIds.includes(currentUserId));

    return {
      question: poll.question,
      options: poll.options.map((opt: any) => ({
        id: opt.id,
        text: opt.text,
        voteCount: hasVoted || poll.isClosed ? opt.voteCount : null, // Only show counts after voting
        hasVoted: opt.voterIds.includes(currentUserId),
        percentage: hasVoted || poll.isClosed
          ? poll.totalVotes > 0
            ? Math.round((opt.voteCount / poll.totalVotes) * 100)
            : 0
          : null,
      })),
      allowMultipleVotes: poll.allowMultipleVotes,
      endsAt: poll.endsAt,
      isClosed: poll.isClosed,
      totalVotes: hasVoted || poll.isClosed ? poll.totalVotes : null,
      hasVoted,
    };
  }

  /**
   * Sanitize comment for response
   */
  private sanitizeComment(comment: any, currentUserId: string, isOwner = false): Record<string, unknown> {
    const isMyComment = comment.authorId === currentUserId;

    return {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      anonymousId: comment.anonymousId,
      isOP: isMyComment,
      content: comment.content,
      reactions: comment.reactions.map((r: any) => ({
        type: r.type,
        count: r.count,
        hasReacted: r.userIds.includes(currentUserId),
      })),
      totalReactions: comment.totalReactions,
      replyCount: comment.replyCount,
      depth: comment.depth,
      isEdited: comment.isEdited,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    };
  }
}
