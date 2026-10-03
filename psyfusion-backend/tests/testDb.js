const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

/**
 * Starts a fresh in-memory MongoDB instance and connects mongoose to it.
 * One instance per test file (call in beforeAll), torn down in afterAll.
 * Deliberately bypasses config/db.js's connectDB() (which reads the
 * placeholder env.MONGO_URI) and connects directly to the ephemeral
 * instance's real URI instead.
 */
async function connectTestDB() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  return mongod;
}

async function disconnectTestDB(mongod) {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

/** Clears all collections between tests without tearing down the connection. */
async function clearTestDB() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

module.exports = { connectTestDB, disconnectTestDB, clearTestDB };
