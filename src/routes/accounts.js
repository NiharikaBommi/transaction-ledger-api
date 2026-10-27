import { Router } from 'express';
import mongoose from 'mongoose';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import { ApiError } from '../middleware/errors.js';

const router = Router();
const isValidId = (id) => mongoose.isValidObjectId(id);
const requireAccount = async (id, session) => {
  if (!isValidId(id)) throw new ApiError(400, 'Invalid account ID', 'INVALID_ACCOUNT_ID');
  const account = await Account.findById(id).session(session || null);
  if (!account) throw new ApiError(404, 'Account not found', 'ACCOUNT_NOT_FOUND');
  return account;
};

// POST /api/accounts. Ignore any client-supplied balance and always start at zero.
router.post('/', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name) throw new ApiError(400, 'name is required', 'VALIDATION_ERROR');
    if (name.length > 120) throw new ApiError(400, 'name must be at most 120 characters', 'VALIDATION_ERROR');
    const account = await Account.create({ name, balance: 0 });
    res.status(201).json({ data: account });
  } catch (err) { next(err); }
});

// GET /api/accounts/:accountId/balance
router.get('/:accountId/balance', async (req, res, next) => {
  try {
    const account = await requireAccount(req.params.accountId);
    res.json({ data: { account_id: account.id, balance: account.balance } });
  } catch (err) { next(err); }
});

// POST /api/accounts/:accountId/transactions
router.post('/:accountId/transactions', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { type, amount, description = '', reference_id } = req.body || {};
    if (!['credit', 'debit'].includes(type)) throw new ApiError(400, 'type must be either credit or debit', 'INVALID_TRANSACTION_TYPE');
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) throw new ApiError(400, 'amount must be a number greater than 0', 'INVALID_AMOUNT');
    if (typeof reference_id !== 'string' || !reference_id.trim()) throw new ApiError(400, 'reference_id is required', 'VALIDATION_ERROR');
    if (reference_id.trim().length > 150) throw new ApiError(400, 'reference_id must be at most 150 characters', 'VALIDATION_ERROR');
    if (typeof description !== 'string') throw new ApiError(400, 'description must be a string', 'VALIDATION_ERROR');

    let created;
    await session.withTransaction(async () => {
      const account = await requireAccount(req.params.accountId, session);
      const duplicate = await Transaction.findOne({ account_id: account._id, reference_id: reference_id.trim() }).session(session);
      if (duplicate) throw new ApiError(409, 'Transaction reference_id already exists for this account', 'DUPLICATE_TRANSACTION');

      let updated;
      if (type === 'credit') {
        updated = await Account.findOneAndUpdate(
          { _id: account._id }, { $inc: { balance: amount } }, { new: true, session, runValidators: true }
        );
      } else {
        // Conditional update prevents a debit below zero, including concurrent debits.
        updated = await Account.findOneAndUpdate(
          { _id: account._id, balance: { $gte: amount } },
          { $inc: { balance: -amount } }, { new: true, session, runValidators: true }
        );
        if (!updated) throw new ApiError(422, 'Insufficient balance', 'INSUFFICIENT_BALANCE');
      }
      const [transaction] = await Transaction.create([{
        account_id: account._id, type, amount,
        description: description.trim(), reference_id: reference_id.trim()
      }], { session });
      created = { transaction, balance: updated.balance };
    });
    res.status(201).json({ data: { transaction: created.transaction, balance: created.balance } });
  } catch (err) { next(err); }
  finally { await session.endSession(); }
});

// GET /api/accounts/:accountId/transactions?type=credit&page=1&limit=10
router.get('/:accountId/transactions', async (req, res, next) => {
  try {
    const account = await requireAccount(req.params.accountId);
    const { type } = req.query;
    if (type !== undefined && !['credit', 'debit'].includes(type)) {
      throw new ApiError(400, 'type must be credit or debit', 'INVALID_TRANSACTION_TYPE');
    }
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 10 : Number(req.query.limit);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new ApiError(400, 'page must be >= 1 and limit must be between 1 and 100', 'INVALID_PAGINATION');
    }
    const filter = { account_id: account._id, ...(type ? { type } : {}) };
    const [transactions, totalRecords] = await Promise.all([
      Transaction.find(filter).sort({ created_at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
      Transaction.countDocuments(filter)
    ]);
    res.json({ data: transactions, pagination: {
      current_page: page, page_size: limit, total_records: totalRecords,
      total_pages: Math.ceil(totalRecords / limit)
    } });
  } catch (err) { next(err); }
});

export default router;
