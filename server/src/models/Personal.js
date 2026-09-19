import mongoose from 'mongoose';

const schemas = {
  Contact: new mongoose.Schema({ name: { type: String, required: true }, phone: String, telegram: String, email: String, notes: String, tags: [String] }, { timestamps: true }),
  Project: new mongoose.Schema({ name: { type: String, required: true }, description: String, status: { type: String, enum: ['planned', 'active', 'on_hold', 'completed', 'cancelled'], default: 'active' }, startDate: Date, targetDate: Date, tags: [String] }, { timestamps: true }),
  Note: new mongoose.Schema({ title: { type: String, required: true }, content: String, tags: [String], pinned: { type: Boolean, default: false }, archived: { type: Boolean, default: false } }, { timestamps: true }),
  Habit: new mongoose.Schema({ name: { type: String, required: true }, frequency: { type: String, enum: ['daily', 'weekdays', 'weekly'], default: 'daily' }, weekdays: [Number], target: { type: Number, default: 1 }, active: { type: Boolean, default: true }, logs: [{ date: Date, value: { type: Number, default: 1 } }] }, { timestamps: true }),
  Wishlist: new mongoose.Schema({ name: { type: String, required: true }, expectedPrice: Number, priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }, category: String, url: String, targetDate: Date, status: { type: String, enum: ['wanted', 'saving', 'purchased', 'cancelled'], default: 'wanted' }, notes: String, goalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Goal' } }, { timestamps: true }),
};

for (const schema of Object.values(schemas)) {
  schema.add({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true } });
  schema.index({ user: 1, createdAt: -1 });
}
schemas.Contact.index({ name: 'text', notes: 'text' });
schemas.Project.index({ name: 'text', description: 'text' });
schemas.Note.index({ title: 'text', content: 'text', tags: 'text' });

export const Contact = mongoose.model('Contact', schemas.Contact);
export const Project = mongoose.model('Project', schemas.Project);
export const Note = mongoose.model('Note', schemas.Note);
export const Habit = mongoose.model('Habit', schemas.Habit);
export const Wishlist = mongoose.model('Wishlist', schemas.Wishlist);
