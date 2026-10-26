import mongoose from 'mongoose';
const content = new mongoose.Schema({ title: { type: String, required: true, maxlength: 180 }, body: { type: String, required: true, maxlength: 4000 } }, { _id: false });
const button = new mongoose.Schema({ label: { type: String, required: true, maxlength: 64 }, url: { type: String, required: true, maxlength: 2048 } }, { _id: false });
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  variants: { en: { type: content, required: true }, ar: { type: content, required: true } },
  buttons: { type: [[button]], default: [] },
  imageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  revision: { type: Number, default: 0 },
}, { timestamps: true, optimisticConcurrency: true });
export const AutomaticMessageTemplate = mongoose.model('AutomaticMessageTemplate', schema);
