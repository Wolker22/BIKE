const express = require('express');
const router = express.Router();
const { sessionTimes } = require('../utils/data');

router.post('/startSession', (req, res) => {
  const userId = req.body.userId;
  sessionTimes[userId] = { start: Date.now() };
  res.sendStatus(200);
});

router.post('/endSession', (req, res) => {
  const userId = req.body.userId;
  if (sessionTimes[userId]) {
    sessionTimes[userId].end = Date.now();
    sessionTimes[userId].duration = sessionTimes[userId].end - sessionTimes[userId].start;
    // Store duration in the database if necessary
  }
  res.sendStatus(200);
});

module.exports = router;
