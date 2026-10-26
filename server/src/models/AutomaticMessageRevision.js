import mongoose from 'mongoose';
const schema = new mongoose.Schema({ template: { type: mongoose.Schema.Types.ObjectId, ref: 'AutomaticMessageTemplate', required: true }, revision: { type: Number, required: true }, variants: mongoose.Schema.Types.Mixed, buttons: mongoose.Schema.Types.Mixed, imageId: mongoose.Schema.Types.ObjectId, enabled: Boolean, updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }, note: { type: String, maxlength: 200 } }, { timestamps: true });
schema.index({ template: 1, revision: 1 }, { unique: true });
export const AutomaticMessageRevision = mongoose.model('AutomaticMessageRevision', schema);
