import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  text: { type: String, required: true, maxlength: 2000 },
}, { timestamps: true });
export const AdminSupportNote = mongoose.model('AdminSupportNote', schema);
