import 'express-async-errors';
import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, Category, Question, Answer, Comment, Vote, Report, ModerationLog } from './models.js';

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use('/api/auth', rateLimit({ windowMs: 900000, limit: 100 }));

const safe = user => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  bio: user.bio,
  active: user.active,
});

const sign = user => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

const auth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.id);
    if (!req.user?.active) return res.status(403).json({ message: 'Account inactive' });
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const optionalAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(payload.id);
      if (user?.active) req.user = user;
    } catch {
      // Public pages may still be viewed when an old token is present.
    }
  }
  next();
};

const roles = (...allowed) => (req, res, next) => (
  allowed.includes(req.user.role)
    ? next()
    : res.status(403).json({ message: 'Insufficient permissions' })
);

const cnt = async (targetType, targetId) => ({
  votes: await Vote.countDocuments({ targetType, targetId }),
  comments: await Comment.countDocuments({ targetType, targetId, hidden: false }),
});

const contentModels = { question: Question, answer: Answer, comment: Comment };
const modelForContent = type => contentModels[type];

const contentSnapshot = item => {
  if (item instanceof Question || item.constructor.modelName === 'Question') {
    return {
      title: item.title,
      description: item.description,
      category: item.category,
      tags: item.tags,
      status: item.status,
      acceptedAnswer: item.acceptedAnswer,
      hidden: item.hidden,
    };
  }
  if (item instanceof Answer || item.constructor.modelName === 'Answer') {
    return { content: item.content, hidden: item.hidden };
  }
  return { content: item.content, hidden: item.hidden };
};

const updateContentFields = (item, type, body) => {
  if (type === 'question') {
    if (body.title !== undefined) item.title = body.title;
    if (body.description !== undefined) item.description = body.description;
    if (body.category !== undefined) item.category = body.category;
    if (body.tags !== undefined) item.tags = Array.isArray(body.tags)
      ? body.tags
      : String(body.tags).split(',').map(value => value.trim()).filter(Boolean);
    if (body.status !== undefined) item.status = body.status;
  } else if (body.content !== undefined) {
    item.content = body.content;
  }
};

const createModerationLog = ({ moderator, action, targetType, targetId, reason, before, after }) => (
  ModerationLog.create({ moderator, action, targetType, targetId, reason, before, after })
);

const moderateContent = async (moderator, type, id, body = {}) => {
  const Model = modelForContent(type);
  if (!Model) {
    const error = new Error('Invalid content type');
    error.status = 400;
    throw error;
  }

  const item = await Model.findById(id);
  if (!item) {
    const error = new Error('Content not found');
    error.status = 404;
    throw error;
  }

  const action = body.action || (body.hidden !== undefined ? (body.hidden ? 'hide' : 'restore') : 'update');
  const before = contentSnapshot(item);
  if (['hide', 'delete'].includes(action)) item.hidden = true;
  else if (action === 'restore') item.hidden = false;
  else if (action === 'update') updateContentFields(item, type, body);
  else {
    const error = new Error('Invalid moderation action');
    error.status = 400;
    throw error;
  }

  await item.save();
  const after = contentSnapshot(item);
  const log = await createModerationLog({
    moderator,
    action,
    targetType: type,
    targetId: item._id,
    reason: body.reason || `Content ${action} by staff review`,
    before,
    after,
  });
  return { item, log };
};

const buildUserActivity = async userId => {
  const [questions, answers, comments, votes] = await Promise.all([
    Question.find({ author: userId }).populate('category', 'name').sort({ createdAt: -1 }).lean(),
    Answer.find({ author: userId }).populate({
      path: 'question',
      select: 'title category hidden',
      populate: { path: 'category', select: 'name' },
    }).sort({ createdAt: -1 }).lean(),
    Comment.find({ author: userId }).sort({ createdAt: -1 }).lean(),
    Vote.find({ user: userId }).sort({ createdAt: -1 }).lean(),
  ]);

  const questionIds = comments.filter(comment => comment.targetType === 'question').map(comment => comment.targetId);
  const answerIds = comments.filter(comment => comment.targetType === 'answer').map(comment => comment.targetId);
  const votedQuestionIds = votes.filter(vote => vote.targetType === 'question').map(vote => vote.targetId);
  const votedAnswerIds = votes.filter(vote => vote.targetType === 'answer').map(vote => vote.targetId);

  const [commentQuestions, commentAnswers, votedQuestions, votedAnswers] = await Promise.all([
    Question.find({ _id: { $in: questionIds } }).populate('category', 'name').select('title category hidden').lean(),
    Answer.find({ _id: { $in: answerIds } }).populate({ path: 'question', select: 'title' }).select('content question hidden').lean(),
    Question.find({ _id: { $in: votedQuestionIds } }).populate('category', 'name').select('title category hidden').lean(),
    Answer.find({ _id: { $in: votedAnswerIds } }).populate({ path: 'question', select: 'title' }).select('content question hidden').lean(),
  ]);

  const questionMap = new Map(commentQuestions.map(question => [String(question._id), question]));
  const answerMap = new Map(commentAnswers.map(answer => [String(answer._id), answer]));
  const votedQuestionMap = new Map(votedQuestions.map(question => [String(question._id), question]));
  const votedAnswerMap = new Map(votedAnswers.map(answer => [String(answer._id), answer]));

  const activityComments = comments.map(comment => ({
    ...comment,
    target: comment.targetType === 'question'
      ? questionMap.get(String(comment.targetId))
      : answerMap.get(String(comment.targetId)),
  }));

  const activityVotes = votes.map(vote => {
    const target = vote.targetType === 'question'
      ? votedQuestionMap.get(String(vote.targetId))
      : votedAnswerMap.get(String(vote.targetId));
    return {
      ...vote,
      target: target
        ? {
          id: target._id,
          title: vote.targetType === 'question' ? target.title : target.question?.title,
          category: vote.targetType === 'question' ? target.category : undefined,
          hidden: target.hidden,
        }
        : null,
    };
  });

  const [votesReceivedOnQuestions, votesReceivedOnAnswers] = await Promise.all([
    Vote.countDocuments({ targetType: 'question', targetId: { $in: questions.map(question => question._id) } }),
    Vote.countDocuments({ targetType: 'answer', targetId: { $in: answers.map(answer => answer._id) } }),
  ]);

  return {
    questions,
    answers,
    comments: activityComments,
    votes: activityVotes,
    stats: {
      questions: questions.length,
      answers: answers.length,
      comments: comments.length,
      votes: votes.length,
      contributions: questions.length + answers.length + comments.length,
      votesReceived: votesReceivedOnQuestions + votesReceivedOnAnswers,
    },
  };
};

const getModerationContent = async userId => {
  const query = userId ? { author: userId } : {};
  const [questions, answers, comments] = await Promise.all([
    Question.find(query).populate('author', 'name email').populate('category', 'name').sort({ createdAt: -1 }).limit(200).lean(),
    Answer.find(query).populate('author', 'name email').populate({
      path: 'question',
      select: 'title category',
      populate: { path: 'category', select: 'name' },
    }).sort({ createdAt: -1 }).limit(200).lean(),
    Comment.find(query).populate('author', 'name email').sort({ createdAt: -1 }).limit(200).lean(),
  ]);

  const questionIds = comments.filter(comment => comment.targetType === 'question').map(comment => comment.targetId);
  const answerIds = comments.filter(comment => comment.targetType === 'answer').map(comment => comment.targetId);
  const [commentQuestions, commentAnswers] = await Promise.all([
    Question.find({ _id: { $in: questionIds } }).populate('category', 'name').select('title category').lean(),
    Answer.find({ _id: { $in: answerIds } }).populate({ path: 'question', select: 'title category', populate: { path: 'category', select: 'name' } }).select('content question').lean(),
  ]);
  const questionMap = new Map(commentQuestions.map(question => [String(question._id), question]));
  const answerMap = new Map(commentAnswers.map(answer => [String(answer._id), answer]));
  return {
    questions,
    answers,
    comments: comments.map(comment => ({
      ...comment,
      target: comment.targetType === 'question'
        ? questionMap.get(String(comment.targetId))
        : answerMap.get(String(comment.targetId)),
    })),
  };
};

app.get('/api/health', (req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 }));

// Authentication and account management
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Name, email, and password of at least 8 characters are required' });
  }
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: sign(user), user: safe(user) });
});

app.post('/api/auth/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email?.toLowerCase() }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (!user.active) return res.status(403).json({ message: 'Account inactive' });
  res.json({ token: sign(user), user: safe(user) });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: safe(req.user) }));

app.patch('/api/users/me', auth, async (req, res) => {
  req.user.name = req.body.name ?? req.user.name;
  req.user.bio = req.body.bio ?? req.user.bio;
  await req.user.save();
  res.json({ user: safe(req.user) });
});

app.get('/api/users/:id', optionalAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'User not found' });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const activity = await buildUserActivity(user._id);
  res.json({
    user: safe(user),
    stats: activity.stats,
    activity: {
      questions: activity.questions,
      answers: activity.answers,
      comments: activity.comments,
      votes: activity.votes,
    },
    canManage: Boolean(req.user && String(req.user._id) === String(user._id)),
  });
});

// Categories
app.get('/api/categories', async (req, res) => res.json(await Category.find().sort('name')));
app.post('/api/categories', auth, roles('admin'), async (req, res) => (
  res.status(201).json(await Category.create({ name: req.body.name, description: req.body.description, createdBy: req.user._id }))
));
app.patch('/api/categories/:id', auth, roles('admin'), async (req, res) => (
  res.json(await Category.findByIdAndUpdate(req.params.id, { name: req.body.name, description: req.body.description }, { new: true, runValidators: true }))
));
app.delete('/api/categories/:id', auth, roles('admin'), async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ message: 'Category deleted' });
});

// Questions, answers, comments, and votes
app.get('/api/questions', async (req, res) => {
  const { q, category, status } = req.query;
  const filter = { hidden: false };
  if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } }, { description: { $regex: q, $options: 'i' } }, { tags: { $regex: q, $options: 'i' } }];
  if (category) filter.category = category;
  if (status === 'unanswered') filter.status = 'open';
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = 10;
  const [items, total] = await Promise.all([
    Question.find(filter).populate('author', 'name role').populate('category', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Question.countDocuments(filter),
  ]);
  const enriched = await Promise.all(items.map(async item => ({
    ...item,
    ...await cnt('question', item._id),
    answers: await Answer.countDocuments({ question: item._id, hidden: false }),
  })));
  res.json({ items: enriched, total, page, pages: Math.ceil(total / limit) });
});

app.post('/api/questions', auth, async (req, res) => {
  const question = await Question.create({
    title: req.body.title,
    description: req.body.description,
    category: req.body.category,
    tags: req.body.tags || [],
    author: req.user._id,
  });
  res.status(201).json(await question.populate([{ path: 'author', select: 'name role' }, { path: 'category', select: 'name' }]));
});

app.get('/api/questions/:id', async (req, res) => {
  const question = await Question.findOne({ _id: req.params.id, hidden: false }).populate('author', 'name role bio').populate('category', 'name');
  if (!question) return res.status(404).json({ message: 'Question not found' });
  const [answers, comments, stats] = await Promise.all([
    Answer.find({ question: question._id, hidden: false }).populate('author', 'name role').sort({ createdAt: 1 }).lean(),
    Comment.find({ targetType: 'question', targetId: question._id, hidden: false }).populate('author', 'name').sort({ createdAt: 1 }),
    cnt('question', question._id),
  ]);
  for (const answer of answers) {
    answer.stats = await cnt('answer', answer._id);
    answer.comments = await Comment.find({ targetType: 'answer', targetId: answer._id, hidden: false }).populate('author', 'name');
  }
  res.json({ question, answers, comments, stats });
});

app.patch('/api/questions/:id', auth, async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ message: 'Not found' });
  if (String(question.author) !== String(req.user._id) && !['admin', 'moderator'].includes(req.user.role)) return res.status(403).json({ message: 'Not allowed' });
  updateContentFields(question, 'question', req.body);
  await question.save();
  res.json(question);
});

app.delete('/api/questions/:id', auth, async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question) return res.status(404).json({ message: 'Not found' });
  if (String(question.author) !== String(req.user._id) && !['admin', 'moderator'].includes(req.user.role)) return res.status(403).json({ message: 'Not allowed' });
  question.hidden = true;
  await question.save();
  res.json({ message: 'Question removed' });
});

app.post('/api/questions/:id/answers', auth, async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question || question.hidden) return res.status(404).json({ message: 'Question not found' });
  const answer = await Answer.create({ question: question._id, content: req.body.content, author: req.user._id });
  question.status = 'answered';
  await question.save();
  res.status(201).json(await answer.populate('author', 'name role'));
});

app.post('/api/questions/:id/accept/:answerId', auth, async (req, res) => {
  const question = await Question.findById(req.params.id);
  if (!question || String(question.author) !== String(req.user._id)) return res.status(403).json({ message: 'Only the question owner can accept an answer' });
  if (!await Answer.exists({ _id: req.params.answerId, question: question._id })) return res.status(404).json({ message: 'Answer not found' });
  question.acceptedAnswer = req.params.answerId;
  question.status = 'closed';
  await question.save();
  res.json(question);
});

const updateAnswer = async (req, res) => {
  const answer = await Answer.findById(req.params.id);
  if (!answer) return res.status(404).json({ message: 'Not found' });
  if (String(answer.author) !== String(req.user._id) && !['admin', 'moderator'].includes(req.user.role)) return res.status(403).json({ message: 'Not allowed' });
  answer.content = req.body.content ?? answer.content;
  await answer.save();
  res.json(answer);
};

app.patch('/api/answers/:id', auth, updateAnswer);
app.post('/api/answers/:id', auth, updateAnswer);
app.delete('/api/answers/:id', auth, async (req, res) => {
  const answer = await Answer.findById(req.params.id);
  if (!answer) return res.status(404).json({ message: 'Not found' });
  if (String(answer.author) !== String(req.user._id) && !['admin', 'moderator'].includes(req.user.role)) return res.status(403).json({ message: 'Not allowed' });
  answer.hidden = true;
  await answer.save();
  res.json({ message: 'Answer removed' });
});

app.post('/api/comments', auth, async (req, res) => {
  const Model = req.body.targetType === 'question' ? Question : req.body.targetType === 'answer' ? Answer : null;
  if (!Model || !await Model.exists({ _id: req.body.targetId, hidden: false })) return res.status(404).json({ message: 'Discussion target not found' });
  const comment = await Comment.create({ content: req.body.content, author: req.user._id, targetType: req.body.targetType, targetId: req.body.targetId });
  res.status(201).json(await comment.populate('author', 'name'));
});

app.patch('/api/comments/:id', auth, async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ message: 'Not found' });
  if (String(comment.author) !== String(req.user._id) && !['admin', 'moderator'].includes(req.user.role)) return res.status(403).json({ message: 'Not allowed' });
  if (req.body.content !== undefined) comment.content = req.body.content;
  await comment.save();
  res.json(comment);
});

app.delete('/api/comments/:id', auth, async (req, res) => {
  const comment = await Comment.findById(req.params.id);
  if (!comment) return res.status(404).json({ message: 'Not found' });
  if (String(comment.author) !== String(req.user._id) && !['admin', 'moderator'].includes(req.user.role)) return res.status(403).json({ message: 'Not allowed' });
  comment.hidden = true;
  await comment.save();
  res.json({ message: 'Comment removed' });
});

app.post('/api/votes', auth, async (req, res) => {
  const { targetType, targetId } = req.body;
  const Model = targetType === 'question' ? Question : targetType === 'answer' ? Answer : null;
  if (!Model || !await Model.exists({ _id: targetId, hidden: false })) return res.status(404).json({ message: 'Content not found' });
  const existing = await Vote.findOne({ user: req.user._id, targetType, targetId });
  if (existing) {
    await existing.deleteOne();
    return res.json({ ...await cnt(targetType, targetId), voted: false });
  }
  await Vote.create({ user: req.user._id, targetType, targetId, voteType: 'up' });
  res.json({ ...await cnt(targetType, targetId), voted: true });
});

app.delete('/api/votes/:targetType/:targetId', auth, async (req, res) => {
  await Vote.deleteOne({ user: req.user._id, targetType: req.params.targetType, targetId: req.params.targetId });
  res.json(await cnt(req.params.targetType, req.params.targetId));
});

// Community reports
app.post('/api/reports', auth, async (req, res) => {
  if (await Report.exists({ reporter: req.user._id, targetType: req.body.targetType, targetId: req.body.targetId, status: 'pending' })) {
    return res.status(409).json({ message: 'You already reported this content' });
  }
  res.status(201).json(await Report.create({ reporter: req.user._id, targetType: req.body.targetType, targetId: req.body.targetId, reason: req.body.reason }));
});

app.get('/api/moderation/reports', auth, roles('moderator', 'admin'), async (req, res) => (
  res.json(await Report.find(req.query.status ? { status: req.query.status } : {})
    .populate('reporter', 'name email').populate('reviewedBy', 'name').sort({ createdAt: -1 }))
));

app.patch('/api/moderation/reports/:id', auth, roles('moderator', 'admin'), async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) return res.status(404).json({ message: 'Report not found' });
  report.status = req.body.status || report.status;
  report.resolution = req.body.resolution || '';
  report.reviewedBy = req.user._id;
  await report.save();
  if (req.body.hide) await moderateContent(req.user._id, report.targetType, report.targetId, { action: 'hide', reason: report.resolution || 'Hidden from report review' });
  else await createModerationLog({ moderator: req.user._id, action: 'review', targetType: report.targetType, targetId: report.targetId, reason: report.resolution });
  res.json(report);
});

// Moderator and admin content workspace. Both roles can see authors and domains.
app.get('/api/moderation/users', auth, roles('moderator', 'admin'), async (req, res) => {
  const users = await User.find().select('name email role active createdAt').sort({ createdAt: -1 }).lean();
  const rows = await Promise.all(users.map(async user => {
    const [questions, answers, comments, votes] = await Promise.all([
      Question.countDocuments({ author: user._id }),
      Answer.countDocuments({ author: user._id }),
      Comment.countDocuments({ author: user._id }),
      Vote.countDocuments({ user: user._id }),
    ]);
    const questionIds = await Question.find({ author: user._id }).distinct('_id');
    const answerIds = await Answer.find({ author: user._id }).distinct('_id');
    const votesReceived = await Vote.countDocuments({ $or: [
      { targetType: 'question', targetId: { $in: questionIds } },
      { targetType: 'answer', targetId: { $in: answerIds } },
    ] });
    return { ...user, questions, answers, comments, votes, votesReceived, contributions: questions + answers + comments };
  }));
  res.json(rows);
});

app.get('/api/moderation/content', auth, roles('moderator', 'admin'), async (req, res) => {
  res.json(await getModerationContent(req.query.userId));
});

app.patch('/api/moderation/content/:type/:id', auth, roles('moderator', 'admin'), async (req, res) => {
  const result = await moderateContent(req.user._id, req.params.type, req.params.id, req.body);
  res.json(result);
});

app.delete('/api/moderation/content/:type/:id', auth, roles('moderator', 'admin'), async (req, res) => {
  const result = await moderateContent(req.user._id, req.params.type, req.params.id, { action: 'delete', reason: req.body.reason || 'Removed by staff review' });
  res.json(result);
});

app.get('/api/moderation/history', auth, roles('moderator', 'admin'), async (req, res) => {
  const logs = await ModerationLog.find({ before: { $exists: true, $ne: null }, after: { $exists: true, $ne: null } }).populate('moderator', 'name email').sort({ createdAt: -1 }).limit(100).lean();
  const history = await Promise.all(logs.map(async log => {
    const Model = modelForContent(log.targetType);
    const item = Model ? await Model.findById(log.targetId).select('title content').lean() : null;
    return { ...log, targetLabel: item?.title || item?.content?.slice(0, 100) || 'Deleted content' };
  }));
  res.json(history);
});

const restoreFromLog = async (req, res, undone) => {
  const log = await ModerationLog.findById(req.params.id);
  if (!log) return res.status(404).json({ message: 'Moderation action not found' });
  if (Boolean(log.undone) !== !undone) return res.status(409).json({ message: undone ? 'Action is already undone' : 'Action is already active' });
  const Model = modelForContent(log.targetType);
  const item = await Model.findById(log.targetId);
  if (!item) return res.status(404).json({ message: 'Content no longer exists' });
  const state = undone ? log.before : log.after;
  if (!state) return res.status(409).json({ message: 'This older action cannot be undone or redone' });
  Object.assign(item, state);
  await item.save();
  log.undone = undone;
  await log.save();
  res.json({ item, log });
};

app.post('/api/moderation/history/:id/undo', auth, roles('moderator', 'admin'), async (req, res) => restoreFromLog(req, res, true));
app.post('/api/moderation/history/:id/redo', auth, roles('moderator', 'admin'), async (req, res) => restoreFromLog(req, res, false));

// Admin-only account controls. Moderators intentionally have no route for these.
app.get('/api/admin/users', auth, roles('admin'), async (req, res) => (
  res.json(await User.find().select('-passwordHash').sort({ createdAt: -1 }))
));

app.post('/api/admin/users', auth, roles('admin'), async (req, res) => {
  const { name, email, password, role = 'user', bio = '' } = req.body;
  if (!name || !email || !password || password.length < 8) return res.status(400).json({ message: 'Name, email, and password of at least 8 characters are required' });
  if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
  const user = await User.create({ name, email, bio, role, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json(safe(user));
});

app.patch('/api/admin/users/:id', auth, roles('admin'), async (req, res) => {
  if (String(req.user._id) === req.params.id && req.body.active === false) return res.status(400).json({ message: 'You cannot deactivate yourself' });
  const update = {};
  if (req.body.role !== undefined) update.role = req.body.role;
  if (req.body.active !== undefined) update.active = req.body.active;
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(safe(user));
});

app.delete('/api/admin/users/:id', auth, roles('admin'), async (req, res) => {
  if (String(req.user._id) === req.params.id) return res.status(400).json({ message: 'You cannot remove yourself' });
  const user = await User.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User removed from the application', user: safe(user) });
});

// Legacy admin endpoints remain available for reports and compatibility.
app.get('/api/admin/questions', auth, roles('admin'), async (req, res) => (
  res.json(await Question.find().populate('author', 'name email').populate('category', 'name').sort({ createdAt: -1 }))
));
app.get('/api/admin/answers', auth, roles('admin'), async (req, res) => (
  res.json(await Answer.find().populate('author', 'name email').populate('question', 'title').sort({ createdAt: -1 }))
));
app.get('/api/admin/comments', auth, roles('admin'), async (req, res) => (
  res.json(await Comment.find().populate('author', 'name email').sort({ createdAt: -1 }))
));
app.patch('/api/admin/comments/:id', auth, roles('admin'), async (req, res) => (
  res.json(await Comment.findByIdAndUpdate(req.params.id, { content: req.body.content, hidden: req.body.hidden }, { new: true, runValidators: true }))
));
app.delete('/api/admin/comments/:id', auth, roles('admin'), async (req, res) => {
  await Comment.findByIdAndUpdate(req.params.id, { hidden: true });
  res.json({ message: 'Comment hidden' });
});

app.get('/api/admin/stats', auth, roles('admin'), async (req, res) => {
  const [users, questions, answers, comments, reports] = await Promise.all([
    User.countDocuments(),
    Question.countDocuments({ hidden: false }),
    Answer.countDocuments({ hidden: false }),
    Comment.countDocuments({ hidden: false }),
    Report.countDocuments({ status: 'pending' }),
  ]);
  res.json({ users, questions, answers, comments, reports });
});

const reportGuard = (req, res, next) => auth(req, res, () => roles('admin', 'moderator')(req, res, next));

app.get('/api/reports/discussed', reportGuard, async (req, res) => {
  const rows = await Question.aggregate([
    { $match: { hidden: false } },
    { $lookup: { from: 'answers', localField: '_id', foreignField: 'question', as: 'answers' } },
    { $lookup: { from: 'comments', let: { id: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$targetType', 'question'] }, { $eq: ['$targetId', '$$id'] }, { $eq: ['$hidden', false] }] } } }], as: 'comments' } },
    { $project: { title: 1, category: 1, createdAt: 1, answers: { $size: '$answers' }, comments: { $size: '$comments' } } },
    { $addFields: { activity: { $add: ['$answers', '$comments'] } } },
    { $sort: { activity: -1 } },
  ]);
  res.json(rows);
});

app.get('/api/reports/contributions', reportGuard, async (req, res) => {
  const users = await User.find().select('name email role').lean();
  const output = await Promise.all(users.map(async user => {
    const [questions, answers, comments, votes] = await Promise.all([
      Question.countDocuments({ author: user._id }),
      Answer.countDocuments({ author: user._id }),
      Comment.countDocuments({ author: user._id }),
      Vote.countDocuments({ user: user._id }),
    ]);
    return { ...user, questions, answers, comments, votes, contributions: questions + answers + comments };
  }));
  res.json(output);
});

app.get('/api/reports/unanswered', reportGuard, async (req, res) => {
  const questions = await Question.find({ hidden: false }).populate('author', 'name').populate('category', 'name').lean();
  const output = [];
  for (const question of questions) {
    const answers = await Answer.countDocuments({ question: question._id, hidden: false });
    if (!answers) output.push({ ...question, ageDays: Math.floor((Date.now() - new Date(question.createdAt)) / 86400000), answers });
  }
  res.json(output.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
});

app.get('/api/reports/categories', reportGuard, async (req, res) => {
  const categories = await Category.find().lean();
  const output = await Promise.all(categories.map(async category => {
    const questionIds = await Question.find({ category: category._id, hidden: false }).distinct('_id');
    const [answers, comments] = await Promise.all([
      Answer.countDocuments({ question: { $in: questionIds }, hidden: false }),
      Comment.countDocuments({ targetType: 'question', targetId: { $in: questionIds }, hidden: false }),
    ]);
    return { ...category, questions: questionIds.length, answers, comments, totalDiscussions: questionIds.length + answers + comments, activity: answers + comments };
  }));
  res.json(output);
});

app.get('/api/recommendations/:id', async (req, res) => {
  const question = await Question.findById(req.params.id).lean();
  if (!question) return res.status(404).json({ message: 'Question not found' });
  const related = await Question.find({ _id: { $ne: question._id }, hidden: false, $or: [{ category: question.category }, { tags: { $in: question.tags || [] } }] })
    .populate('category', 'name').sort({ createdAt: -1 }).limit(6).lean();
  const enriched = await Promise.all(related.map(async item => ({
    ...item,
    answers: await Answer.countDocuments({ question: item._id, hidden: false }),
    votes: await Vote.countDocuments({ targetType: 'question', targetId: item._id }),
  })));
  res.json(enriched);
});

app.use((error, req, res, next) => {
  console.error(error);
  const status = error.status || (error.name === 'ValidationError' ? 400 : 500);
  res.status(status).json({ message: error.name === 'ValidationError' ? Object.values(error.errors).map(item => item.message).join(', ') : error.message || 'Server error' });
});

const port = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledgehub')
  .then(() => app.listen(port, () => console.log(`API listening on ${port}`)))
  .catch(error => {
    console.error('MongoDB connection failed', error.message);
    process.exit(1);
  });
