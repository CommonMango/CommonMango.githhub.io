const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/diaryapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  prompt: String
});

const DiarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  conversation: String,
  summary: String,
  video: String,
  date: Date,
  title: String,
  thumbnail: String
});

const User = mongoose.model('User', UserSchema);
const Diary = mongoose.model('Diary', DiarySchema);

// Stub functions for GPT and video generation
async function summarizeConversation(conversation, prompt) {
  // TODO: replace with real GPT API call
  return `${prompt ? '[' + prompt + '] ' : ''}${conversation}`.slice(0, 100);
}

async function generateVideo(summary) {
  // TODO: replace with real Google video generation API call
  const filename = `videos/${Date.now()}.mp4`;
  // ensure videos directory exists
  if (!fs.existsSync('videos')) fs.mkdirSync('videos');
  fs.writeFileSync(filename, '');
  return filename;
}

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const SECRET = 'change-this-secret';

function auth(req, res, next) {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
  if (!token) return res.status(401).json({error: 'Missing token'});
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    res.status(401).json({error: 'Invalid token'});
  }
}

app.post('/signup', async (req, res) => {
  const {username, password} = req.body;
  if (!username || !password) return res.status(400).json({error: 'Missing credentials'});
  if (await User.findOne({username})) return res.status(400).json({error: 'User exists'});
  const user = new User({username, password: bcrypt.hashSync(password, 10), prompt: ''});
  await user.save();
  res.json({ok: true});
});

app.post('/login', async (req, res) => {
  const {username, password} = req.body;
  const user = await User.findOne({username});
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({error: 'Invalid credentials'});
  }
  const token = jwt.sign({id: user._id, username: user.username}, SECRET);
  res.json({token});
});

app.post('/prompt', auth, async (req, res) => {
  const {prompt} = req.body;
  await User.updateOne({_id: req.user.id}, {prompt: prompt || ''});
  res.json({ok: true});
});

app.get('/prompt', auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({prompt: user ? user.prompt : ''});
});

app.post('/diary', auth, async (req, res) => {
  const {conversation} = req.body;
  const user = await User.findById(req.user.id);
  const summary = await summarizeConversation(conversation, user ? user.prompt : '');
  const video = await generateVideo(summary);
  const diary = new Diary({
    user: req.user.id,
    conversation,
    summary,
    video,
    date: new Date(),
    title: summary.substring(0, 20),
    thumbnail: ''
  });
  await diary.save();
  res.json({id: diary._id, summary});
});

app.get('/diaries', auth, async (req, res) => {
  const diaries = await Diary.find({user: req.user.id}).sort({date: -1});
  const list = diaries.map(d => ({
    id: d._id,
    title: d.title,
    date: d.date,
    thumbnail: d.thumbnail
  }));
  res.json(list);
});

app.get('/diary/:id', auth, async (req, res) => {
  const diary = await Diary.findById(req.params.id);
  if (!diary || diary.user.toString() !== req.user.id) return res.status(404).json({error: 'Not found'});
  res.json(diary);
});

app.put('/diary/:id/title', auth, async (req, res) => {
  const diary = await Diary.findById(req.params.id);
  if (!diary || diary.user.toString() !== req.user.id) return res.status(404).json({error: 'Not found'});
  diary.title = req.body.title;
  await diary.save();
  res.json({ok: true});
});

app.put('/diary/:id/thumbnail', auth, async (req, res) => {
  const diary = await Diary.findById(req.params.id);
  if (!diary || diary.user.toString() !== req.user.id) return res.status(404).json({error: 'Not found'});
  diary.thumbnail = req.body.thumbnail; // store path to image frame
  await diary.save();
  res.json({ok: true});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port', PORT));
