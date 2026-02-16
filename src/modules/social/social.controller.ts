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
import { CreatePostDto, CreateCommentDto, ReactToPostDto, VotePollDto } from './dto';

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
  @ApiQuery({ name: 'cursor', required: false, description: 'Pagination cursor' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of posts to return (default: 20)' })
  @ApiQuery({ name: 'sort', required: false, enum: ['recent', 'trending'], description: 'Sort order (default: recent)' })
  @ApiQuery({ name: 'filter', required: false, enum: ['polls'], description: 'Filter posts by type' })
  async getFeed(
    @CurrentUser() user: User,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: 'recent' | 'trending',
    @Query('filter') filter?: 'polls',
  ) {
    const { posts, nextCursor } = await this.socialService.getFeed(
      user.universityId,
      user.facultyId,
      user.departmentId,
      {
        cursor,
        limit: Number(limit) || 20,
        sort: sort || 'recent',
        pollsOnly: filter === 'polls',
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
