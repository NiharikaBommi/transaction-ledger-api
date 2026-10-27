import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, immutable: true },
  type: { type: String, enum: ['credit', 'debit'], required: true, immutable: true },
  amount: { type: Number, required: true, min: 0.01, immutable: true },
  description: { type: String, trim: true, default: '', maxlength: 500, immutable: true },
  reference_id: { type: String, required: true, trim: true, immutable: true },
  created_at: { type: Date, default: Date.now, immutable: true }
}, { versionKey: false });

// Idempotency is scoped to an account: the same reference can be used on another account.
transactionSchema.index({ account_id: 1, reference_id: 1 }, { unique: true });
transactionSchema.index({ account_id: 1, created_at: -1 });

transactionSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    ret.account_id = ret.account_id.toString();
    delete ret._id;
    return ret;
  }
});

export default mongoose.model('Transaction', transactionSchema);
