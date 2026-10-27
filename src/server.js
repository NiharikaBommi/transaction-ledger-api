
import dns from 'node:dns';
import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';

// Work around SRV DNS resolution failure
dns.setServers(['8.8.8.8', '1.1.1.1']);


const port = Number(process.env.PORT || 3000);

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is missing.');
  process.exit(1);
}

try {
  await mongoose.connect(uri);
  await mongoose.model('Transaction').init();

  app.listen(port, () => {
    console.log(`Transaction Ledger API listening on port ${port}`);
  });
} catch (error) {
  console.error('Failed to start API:', error.message);
  process.exit(1);
}
