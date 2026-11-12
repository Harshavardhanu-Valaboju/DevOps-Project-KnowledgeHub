import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { User, Category, Question, Answer, Comment, Vote, Report } from './models.js';

dotenv.config();
await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/knowledgehub');
const hash = value => bcrypt.hash(value, 12);
const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@knowledgehub.local';
const moderatorEmail = process.env.SEED_MODERATOR_EMAIL || 'moderator@knowledgehub.local';
const admin = await User.findOneAndUpdate({ email: adminEmail }, { name: 'Platform Admin', email: adminEmail, role: 'admin', active: true, passwordHash: await hash(process.env.SEED_ADMIN_PASSWORD || 'Admin@12345') }, { upsert: true, new: true });
await User.findOneAndUpdate({ email: moderatorEmail }, { name: 'Content Moderator', email: moderatorEmail, role: 'moderator', active: true, passwordHash: await hash(process.env.SEED_MODERATOR_PASSWORD || 'Moderator@12345') }, { upsert: true, new: true });

const categoryData = [
  ['Web Development', 'Frontend, backend, APIs, and full-stack engineering.'],
  ['DevOps', 'Containers, CI/CD, cloud, and reliability.'],
  ['Database', 'MongoDB, data modeling, and query design.'],
  ['Career & Learning', 'Study strategies, projects, and professional growth.'],
  ['AI and ML', 'Artificial intelligence, machine learning, models, and responsible AI.'],
  ['Python', 'Python programming, automation, data tools, and backend development.'],
  ['Software Development', 'Architecture, testing, design patterns, and software engineering practices.']
];
for (const [name, description] of categoryData) await Category.updateOne({ name }, { $setOnInsert: { name, description, createdBy: admin._id } }, { upsert: true });

const users = [];
for (let i = 1; i <= 24; i++) {
  const number = String(i).padStart(2, '0');
  const newEmail = `user${number}@knowledgehub.local`;
  const oldEmail = `demo.user${number}@knowledgehub.local`;
  const existing = await User.findOne({ $or: [{ email: newEmail }, { email: oldEmail }] });
  const user = existing || new User({});
  user.name = `user${number}`;
  user.email = newEmail;
  user.passwordHash = user.passwordHash || await hash('Demo@12345');
  user.role = 'user';
  user.active = true;
  user.bio = 'KnowledgeHub contributor.';
  await user.save();
  users.push(user);
}

const categories = await Category.find().sort('name');
const categoryByName = new Map(categories.map(c => [c.name, c]));
const topicGroups = [
  ['Web Development', 'How do I structure a production-ready Express API?', 'express,api,node'],
  ['DevOps', 'How can I create a reliable Docker Compose workflow?', 'docker,devops,containers'],
  ['Database', 'What is the best way to optimize a MongoDB query?', 'mongodb,performance,database'],
  ['Career & Learning', 'What are practical ways to prepare for a technical interview?', 'career,interview,learning'],
  ['AI and ML', 'How should I evaluate a machine learning model fairly?', 'ai,machine-learning,metrics'],
  ['AI and ML', 'What is the difference between supervised and unsupervised learning?', 'ai,ml,python'],
  ['Python', 'How can Python automate a repetitive reporting task?', 'python,automation,scripting'],
  ['Python', 'How should I structure a maintainable Python project?', 'python,architecture,testing'],
  ['Software Development', 'Which software design practices reduce technical debt?', 'architecture,testing,design'],
  ['Software Development', 'How should a team review code effectively?', 'code-review,teamwork,quality']
];

for (const [categoryName, title, tags] of topicGroups) {
  const existing = await Question.findOne({ title });
  if (existing) continue;
  const question = await Question.create({ title, description: `This demonstration discussion explores ${title.toLowerCase()} The author wants a clear, beginner-friendly explanation with practical examples, trade-offs, and testing recommendations.`, author: users[topicGroups.indexOf(topicGroups.find(x => x[1] === title)) % users.length]._id, category: categoryByName.get(categoryName)._id, tags: tags.split(','), status: 'answered' });
  const answer = await Answer.create({ question: question._id, author: users[(topicGroups.indexOf(topicGroups.find(x => x[1] === title)) + 3) % users.length]._id, content: 'Start with a small, testable design. Explain the assumptions, validate inputs, measure the result, and document the trade-offs. An accepted answer should include a working example and mention how to improve the approach as usage grows.' });
  question.acceptedAnswer = answer._id;
  question.status = 'closed';
  await question.save();
  await Comment.create({ content: 'This practical explanation is useful for the project demonstration.', author: users[5]._id, targetType: 'answer', targetId: answer._id });
  await Vote.create({ user: users[6]._id, targetType: 'question', targetId: question._id, voteType: 'up' });
}

if (await Question.countDocuments() < 20) {
  for (let i = 0; i < 40; i++) {
    const group = topicGroups[i % topicGroups.length];
    const question = await Question.create({ title: `${group[1]} (${i + 1})`, description: 'This is a synthetic but realistic discussion for the lecturer demonstration. Please explain a maintainable solution, the key decisions, and how to verify it with tests.', author: users[i % users.length]._id, category: categoryByName.get(group[0])._id, tags: group[2].split(','), status: i % 4 === 0 ? 'open' : 'answered' });
    if (i % 4 !== 0) { const answer = await Answer.create({ question: question._id, author: users[(i + 2) % users.length]._id, content: 'A good approach is to begin with a simple implementation, validate it with tests, then improve performance and maintainability using measured results.' }); question.acceptedAnswer = answer._id; question.status = 'closed'; await question.save(); }
  }
}
console.log('Seeded categories including AI and ML, Python, and Software Development.');
console.log('Migrated demonstration users to user01@knowledgehub.local through user24@knowledgehub.local.');
console.log(`Admin: ${adminEmail}; moderator: ${moderatorEmail}`);
await mongoose.disconnect();
