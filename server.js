const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path'); 
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/adminRoutes');


dotenv.config();


connectDB();

const app = express();


app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', 
  credentials: true 
}));
app.use(express.json());


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});


app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/tweets', require('./routes/tweetRoutes'));
app.use('/api/upload', uploadRoutes); 
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`Database: ${process.env.MONGO_URI ? 'Connected' : 'Missing config'}\n`);
});