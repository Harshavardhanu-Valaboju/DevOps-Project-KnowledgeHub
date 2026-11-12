import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'moderator', 'admin'], default: 'user' },
  bio: { type: String, maxlength: 500, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true }));

export const Category = model('Category', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

export const Question = model('Question', new Schema({
  title: { type: String, required: true, trim: true, minlength: 10, maxlength: 180 },
  description: { type: String, required: true, minlength: 20 },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  tags: [{ type: String, trim: true, lowercase: true }],
  status: { type: String, enum: ['open', 'answered', 'closed'], default: 'open' },
  acceptedAnswer: { type: Schema.Types.ObjectId, ref: 'Answer', default: null },
  hidden: { type: Boolean, default: false },
}, { timestamps: true }));

export const Answer = model('Answer', new Schema({
  question: { type: Schema.Types.ObjectId, ref: 'Question', required: true },
  content: { type: String, required: true, minlength: 10 },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  hidden: { type: Boolean, default: false },
}, { timestamps: true }));

export const Comment = model('Comment', new Schema({
  content: { type: String, required: true, minlength: 2, maxlength: 1000 },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['question', 'answer'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  hidden: { type: Boolean, default: false },
}, { timestamps: true }));

export const Vote = model('Vote', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['question', 'answer'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  voteType: { type: String, enum: ['up'], default: 'up' },
}, { timestamps: true }));

Vote.schema.index({ user: 1, targetType: 1, targetId: 1 }, { unique: true });

export const Report = model('Report', new Schema({
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['question', 'answer', 'comment'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, required: true, maxlength: 500 },
  status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  resolution: { type: String, default: '' },
}, { timestamps: true }));

// Store before/after states so staff can safely undo or redo content changes.
export const ModerationLog = model('ModerationLog', new Schema({
  moderator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  targetType: { type: String, enum: ['question', 'answer', 'comment'], required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  reason: { type: String, default: '' },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  undone: { type: Boolean, default: false },
}, { timestamps: true }));
