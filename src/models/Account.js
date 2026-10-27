import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  balance: { type: Number, required: true, default: 0, min: 0 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false });

accountSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.updated_at;
    return ret;
  }
});

export default mongoose.model('Account', accountSchema);
