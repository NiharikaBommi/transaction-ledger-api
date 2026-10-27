
import { Router } from 'express';
import mongoose from 'mongoose';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import { ApiError } from '../middleware/errors.js';

const router = Router();

// POST /api/transfers
// Both account updates and ledger entries commit or roll back together.
router.post('/', async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const {
      from_account_id,
      to_account_id,
      amount,
      reference_id,
      description = 'Money transfer',
    } = req.body || {};

    // Validate account IDs
    if (
      !mongoose.isValidObjectId(from_account_id) ||
      !mongoose.isValidObjectId(to_account_id)
    ) {
      throw new ApiError(
        400,
        'Both account IDs must be valid',
        'INVALID_ACCOUNT_ID'
      );
    }

    // Prevent transferring to the same account
    if (
      String(from_account_id) === String(to_account_id)
    ) {
      throw new ApiError(
        400,
        'Source and destination accounts must be different',
        'SAME_ACCOUNT_TRANSFER'
      );
    }

    // Validate amount
    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new ApiError(
        400,
        'amount must be a number greater than 0',
        'INVALID_AMOUNT'
      );
    }

    // Validate reference and description
    if (
      typeof reference_id !== 'string' ||
      !reference_id.trim()
    ) {
      throw new ApiError(
        400,
        'reference_id is required',
        'VALIDATION_ERROR'
      );
    }

    if (
      typeof description !== 'string' ||
      !description.trim()
    ) {
      throw new ApiError(
        400,
        'description must be a non-empty string',
        'VALIDATION_ERROR'
      );
    }

    const sourceId = new mongoose.Types.ObjectId(
      from_account_id
    );
    const destinationId = new mongoose.Types.ObjectId(
      to_account_id
    );

    const ref = reference_id.trim();
    const cleanDescription = description.trim();

    let result;

    await session.withTransaction(async () => {
      // Verify both accounts exist
      const source = await Account.findById(sourceId)
        .session(session);

      const destination = await Account.findById(destinationId)
        .session(session);

      if (!source || !destination) {
        throw new ApiError(
          404,
          'Both source and destination accounts must exist',
          'ACCOUNT_NOT_FOUND'
        );
      }

      // Check reference uniqueness for both accounts.
      // A transfer creates one entry on each account.
      const existing = await Transaction.findOne({
        account_id: { $in: [sourceId, destinationId] },
        reference_id: ref,
      }).session(session);

      if (existing) {
        throw new ApiError(
          409,
          'reference_id already exists for one of the accounts',
          'DUPLICATE_TRANSACTION'
        );
      }

      // Debit source only if sufficient funds are available
      const debited = await Account.findOneAndUpdate(
        {
          _id: sourceId,
          balance: { $gte: amount },
        },
        {
          $inc: { balance: -amount },
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      if (!debited) {
        throw new ApiError(
          422,
          'Insufficient balance',
          'INSUFFICIENT_BALANCE'
        );
      }

      // Credit destination within the same transaction
      const credited = await Account.findOneAndUpdate(
        { _id: destinationId },
        {
          $inc: { balance: amount },
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      );

      if (!credited) {
        throw new ApiError(
          404,
          'Destination account not found',
          'ACCOUNT_NOT_FOUND'
        );
      }

      // Create both ledger entries in the same session.
      // ordered: true fixes the Mongoose multiple-document error.
      const entries = await Transaction.create(
        [
          {
            account_id: sourceId,
            type: 'debit',
            amount,
            description: `${cleanDescription} (transfer out)`,
            reference_id: ref,
          },
          {
            account_id: destinationId,
            type: 'credit',
            amount,
            description: `${cleanDescription} (transfer in)`,
            reference_id: ref,
          },
        ],
        {
          session,
          ordered: true,
        }
      );

      result = {
        from_account_id: sourceId,
        to_account_id: destinationId,
        from_balance: debited.balance,
        to_balance: credited.balance,
        transactions: entries,
      };
    });

    return res.status(201).json({ data: result });
  } catch (err) {
    return next(err);
  } finally {
    await session.endSession();
  }
});

export default router;
