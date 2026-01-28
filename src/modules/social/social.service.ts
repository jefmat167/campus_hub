import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  Post,
  PostVisibility,
  ReactionType,
  Poll,
} from '../../database/entities/post.entity';
import { Comment } from '../../database/entities/comment.entity';
import {
  generateAnonymousId,
  generatePostContextId,
} from '../../common/utils/anonymous-id.util';
import { CreatePostDto, CreateCommentDto, ReactToPostDto, VotePollDto } from './dto';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);
  private readonly anonymousSecret: string;
  private readonly MAX_COMMENT_DEPTH = 3;

  constructor(
    @InjectRepository(Post) private postRepository: Repository<Post>,
    @InjectRepository(Comment) private commentRepository: Repository<Comment>,
    private configService: ConfigService,
  ) {
    this.anonymousSecret = this.configService.get<string>('ANONYMOUS_SECRET', '');
  }

  /**
   * Create a new anonymous post
   */
  async createPost(
    userId: string,
    universityId: string,
    facultyId: string | null,
    departmentId: string | null,
    dto: CreatePostDto,
  ): Promise<Post> {
    const contextId = generatePostContextId(universityId);
    const anonymousId = generateAnonymousId(userId, contextId, this.anonymousSecret);

    let poll: Poll | null = null;
    if (dto.poll) {
      poll = {
        question: dto.poll.question,
        options: dto.poll.options.map((opt) => ({
          id: uuidv4(),
          text: opt.text,
          voteCount: 0,
          voterIds: [],
        })),
        allowMultipleVotes: dto.poll.allowMultipleVotes || false,
        endsAt: dto.poll.endsAt || null,
        isClosed: false,
        totalVotes: 0,
      };
    }

    const post = this.postRepository.create({
      authorId: userId,
      anonymousId,
      universityId,
      facultyId: dto.visibility === PostVisibility.FACULTY ? facultyId : null,
      departmentId: dto.visibility === PostVisibility.DEPARTMENT ? departmentId : null,
      visibility: dto.visibility || PostVisibility.UNIVERSITY,
      content: dto.content,
      imageUrls: dto.imageUrls || [],
      poll,
    });

    const savedPost = await this.postRepository.save(post);
    this.logger.log(`Post ${savedPost.id} created by user ${userId}`);

    return savedPost;
  }

  /**
   * Get posts feed with pagination (cursor-based)
   */
  async getFeed(
    universityId: string,
    facultyId: string | null,
    departmentId: string | null,
    options: {
      cursor?: string;
      limit?: number;
      sort?: 'recent' | 'trending';
    } = {},
  ): Promise<{ posts: Post[]; nextCursor: string | null }> {
    const { cursor, limit = 20, sort = 'recent' } = options;

    const queryBuilder = this.postRepository
      .createQueryBuilder('post')
      .where('post.universityId = :universityId', { universityId })
      .andWhere('post.isDeleted = false')
      .andWhere('post.isHidden = false');

    // Build visibility filter
    const visibilityConditions = ['post.visibility = :university'];
    const params: Record<string, unknown> = { university: PostVisibility.UNIVERSITY };

    if (facultyId) {
      visibilityConditions.push(
        '(post.visibility = :faculty AND post.facultyId = :facultyId)',
      );
      params.faculty = PostVisibility.FACULTY;
      params.facultyId = facultyId;
    }

    if (departmentId) {
      visibilityConditions.push(
        '(post.visibility = :department AND post.departmentId = :departmentId)',
      );
      params.department = PostVisibility.DEPARTMENT;
      params.departmentId = departmentId;
    }

    queryBuilder.andWhere(`(${visibilityConditions.join(' OR ')})`, params);

    // Add cursor for pagination
    if (cursor) {
      if (sort === 'recent') {
        queryBuilder.andWhere('post.createdAt < :cursor', { cursor: new Date(cursor) });
      } else {
        queryBuilder.andWhere('post.engagementScore < :cursor', {
          cursor: parseFloat(cursor),
        });
      }
    }

    // Sorting
    if (sort === 'recent') {
      queryBuilder.orderBy('post.createdAt', 'DESC');
    } else {
      queryBuilder.orderBy('post.engagementScore', 'DESC').addOrderBy('post.createdAt', 'DESC');
    }

    const posts = await queryBuilder.take(limit + 1).getMany();

    let nextCursor: string | null = null;
    if (posts.length > limit) {
      posts.pop();
      const lastPost = posts[posts.length - 1];
      nextCursor =
        sort === 'recent'
          ? lastPost.createdAt.toISOString()
          : lastPost.engagementScore.toString();
    }

    return { posts, nextCursor };
  }

  /**
   * Get trending posts
   */
  async getTrending(universityId: string, limit = 10): Promise<Post[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.postRepository
      .createQueryBuilder('post')
      .where('post.universityId = :universityId', { universityId })
      .andWhere('post.isDeleted = false')
      .andWhere('post.isHidden = false')
      .andWhere('post.createdAt >= :oneDayAgo', { oneDayAgo })
      .orderBy('post.engagementScore', 'DESC')
      .take(limit)
      .getMany();
  }

  /**
   * Get a single post by ID
   */
  async getPost(postId: string, userId?: string): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post not found');
    }

    // Increment view count
    await this.postRepository.increment({ id: postId }, 'viewCount', 1);

    return post;
  }

  /**
   * React to a post
   */
  async reactToPost(postId: string, userId: string, dto: ReactToPostDto): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post not found');
    }

    const reactionIndex = post.reactions.findIndex((r) => r.type === dto.type);

    if (reactionIndex === -1) {
      throw new BadRequestException('Invalid reaction type');
    }

    const reactions = [...post.reactions];
    const reaction = { ...reactions[reactionIndex] };
    const userIdIndex = reaction.userIds.indexOf(userId);

    if (userIdIndex > -1) {
      // User already reacted with this type - remove reaction
      reaction.userIds = reaction.userIds.filter((id) => id !== userId);
      reaction.count--;
      post.totalReactions--;
    } else {
      // Remove any existing reaction from this user
      for (let i = 0; i < reactions.length; i++) {
        const existingIndex = reactions[i].userIds.indexOf(userId);
        if (existingIndex > -1) {
          reactions[i] = {
            ...reactions[i],
            userIds: reactions[i].userIds.filter((id) => id !== userId),
            count: reactions[i].count - 1,
          };
          post.totalReactions--;
        }
      }

      // Add new reaction
      reaction.userIds = [...reaction.userIds, userId];
      reaction.count++;
      post.totalReactions++;
    }

    reactions[reactionIndex] = reaction;
    post.reactions = reactions;

    // Update engagement score
    post.engagementScore = this.calculateEngagementScore(post);

    await this.postRepository.save(post);

    return post;
  }

  /**
   * Vote on a poll
   */
  async votePoll(postId: string, userId: string, dto: VotePollDto): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post not found');
    }

    if (!post.poll) {
      throw new BadRequestException('This post has no poll');
    }

    if (post.poll.isClosed) {
      throw new BadRequestException('This poll is closed');
    }

    if (post.poll.endsAt && new Date() > new Date(post.poll.endsAt)) {
      post.poll = { ...post.poll, isClosed: true };
      await this.postRepository.save(post);
      throw new BadRequestException('This poll has ended');
    }

    // Check if user already voted
    const hasVoted = post.poll.options.some((opt) => opt.voterIds.includes(userId));

    if (hasVoted && !post.poll.allowMultipleVotes) {
      throw new BadRequestException('You have already voted on this poll');
    }

    const optionIds = dto.optionIds || [dto.optionId];

    if (!post.poll.allowMultipleVotes && optionIds.length > 1) {
      throw new BadRequestException('Multiple votes not allowed');
    }

    const updatedPoll = { ...post.poll };
    const updatedOptions = [...updatedPoll.options];

    for (const optionId of optionIds) {
      const optionIndex = updatedOptions.findIndex((opt) => opt.id === optionId);

      if (optionIndex === -1) {
        throw new BadRequestException(`Poll option ${optionId} not found`);
      }

      const option = updatedOptions[optionIndex];
      if (!option.voterIds.includes(userId)) {
        updatedOptions[optionIndex] = {
          ...option,
          voterIds: [...option.voterIds, userId],
          voteCount: option.voteCount + 1,
        };
        updatedPoll.totalVotes++;
      }
    }

    updatedPoll.options = updatedOptions;
    post.poll = updatedPoll;

    // Update engagement score
    post.engagementScore = this.calculateEngagementScore(post);

    await this.postRepository.save(post);

    return post;
  }

  /**
   * Create a comment on a post
   */
  async createComment(
    postId: string,
    userId: string,
    dto: CreateCommentDto,
  ): Promise<Comment> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post not found');
    }

    let parentComment: Comment | null = null;
    let depth = 0;

    if (dto.parentId) {
      parentComment = await this.commentRepository.findOne({
        where: { id: dto.parentId },
      });

      if (!parentComment || parentComment.isDeleted) {
        throw new NotFoundException('Parent comment not found');
      }

      if (parentComment.postId !== postId) {
        throw new BadRequestException('Parent comment belongs to a different post');
      }

      depth = parentComment.depth + 1;

      if (depth > this.MAX_COMMENT_DEPTH) {
        throw new BadRequestException(
          `Maximum comment depth of ${this.MAX_COMMENT_DEPTH} exceeded`,
        );
      }
    }

    // Generate anonymous ID using the post's context
    const contextId = post.id;
    const anonymousId = generateAnonymousId(userId, contextId, this.anonymousSecret);

    const comment = this.commentRepository.create({
      postId,
      parentId: dto.parentId || null,
      authorId: userId,
      anonymousId,
      content: dto.content,
      depth,
    });

    const savedComment = await this.commentRepository.save(comment);

    // Update post comment count
    await this.postRepository.increment({ id: postId }, 'commentCount', 1);

    // Update parent comment reply count
    if (parentComment) {
      await this.commentRepository.increment({ id: dto.parentId }, 'replyCount', 1);
    }

    // Update post engagement score
    await this.updatePostEngagement(postId);

    this.logger.log(`Comment ${savedComment.id} created on post ${postId}`);

    return savedComment;
  }

  /**
   * Get comments for a post
   */
  async getComments(
    postId: string,
    options: {
      parentId?: string;
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<{ comments: Comment[]; nextCursor: string | null }> {
    const { parentId, cursor, limit = 20 } = options;

    const queryBuilder = this.commentRepository
      .createQueryBuilder('comment')
      .where('comment.postId = :postId', { postId })
      .andWhere('comment.isDeleted = false')
      .andWhere('comment.isHidden = false');

    if (parentId) {
      queryBuilder.andWhere('comment.parentId = :parentId', { parentId });
    } else {
      queryBuilder.andWhere('comment.parentId IS NULL');
    }

    if (cursor) {
      queryBuilder.andWhere('comment.createdAt > :cursor', { cursor: new Date(cursor) });
    }

    const comments = await queryBuilder
      .orderBy('comment.createdAt', 'ASC')
      .take(limit + 1)
      .getMany();

    let nextCursor: string | null = null;
    if (comments.length > limit) {
      comments.pop();
      nextCursor = comments[comments.length - 1].createdAt.toISOString();
    }

    return { comments, nextCursor };
  }

  /**
   * React to a comment
   */
  async reactToComment(
    commentId: string,
    userId: string,
    dto: ReactToPostDto,
  ): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    const reactionIndex = comment.reactions.findIndex((r) => r.type === dto.type);

    if (reactionIndex === -1) {
      throw new BadRequestException('Invalid reaction type');
    }

    const reactions = [...comment.reactions];
    const reaction = { ...reactions[reactionIndex] };
    const userIdIndex = reaction.userIds.indexOf(userId);

    if (userIdIndex > -1) {
      reaction.userIds = reaction.userIds.filter((id) => id !== userId);
      reaction.count--;
      comment.totalReactions--;
    } else {
      // Remove existing reaction
      for (let i = 0; i < reactions.length; i++) {
        const existingIndex = reactions[i].userIds.indexOf(userId);
        if (existingIndex > -1) {
          reactions[i] = {
            ...reactions[i],
            userIds: reactions[i].userIds.filter((id) => id !== userId),
            count: reactions[i].count - 1,
          };
          comment.totalReactions--;
        }
      }

      reaction.userIds = [...reaction.userIds, userId];
      reaction.count++;
      comment.totalReactions++;
    }

    reactions[reactionIndex] = reaction;
    comment.reactions = reactions;

    await this.commentRepository.save(comment);

    return comment;
  }

  /**
   * Delete a post (soft delete)
   */
  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post || post.isDeleted) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    post.isDeleted = true;
    await this.postRepository.save(post);

    this.logger.log(`Post ${postId} deleted by user ${userId}`);
  }

  /**
   * Delete a comment (soft delete)
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment || comment.isDeleted) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    comment.isDeleted = true;
    await this.commentRepository.save(comment);

    // Update post comment count
    await this.postRepository.decrement({ id: comment.postId }, 'commentCount', 1);

    this.logger.log(`Comment ${commentId} deleted by user ${userId}`);
  }

  /**
   * Get user's own posts
   */
  async getUserPosts(
    userId: string,
    cursor?: string,
    limit = 20,
  ): Promise<{ posts: Post[]; nextCursor: string | null }> {
    const queryBuilder = this.postRepository
      .createQueryBuilder('post')
      .where('post.authorId = :userId', { userId })
      .andWhere('post.isDeleted = false');

    if (cursor) {
      queryBuilder.andWhere('post.createdAt < :cursor', { cursor: new Date(cursor) });
    }

    const posts = await queryBuilder
      .orderBy('post.createdAt', 'DESC')
      .take(limit + 1)
      .getMany();

    let nextCursor: string | null = null;
    if (posts.length > limit) {
      posts.pop();
      nextCursor = posts[posts.length - 1].createdAt.toISOString();
    }

    return { posts, nextCursor };
  }

  /**
   * Calculate engagement score for trending
   */
  private calculateEngagementScore(post: Post): number {
    const reactions = post.totalReactions * 2;
    const comments = post.commentCount * 3;
    const views = post.viewCount * 0.1;
    const pollVotes = post.poll?.totalVotes || 0;

    // Time decay - newer posts get a boost
    const ageInHours = (Date.now() - post.createdAt.getTime()) / (1000 * 60 * 60);
    const timeDecay = Math.pow(0.95, ageInHours);

    return (reactions + comments + views + pollVotes) * timeDecay;
  }

  /**
   * Update post engagement score
   */
  private async updatePostEngagement(postId: string): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });
    if (post) {
      post.engagementScore = this.calculateEngagementScore(post);
      await this.postRepository.save(post);
    }
  }
}
