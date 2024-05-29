const mongoose = require('mongoose');

// Configuración del URI de conexión a MongoDB
const mongoURI = 'mongodb+srv://davidpenafernandez19:hMqFAlutsCRFQWIF@cluster0.l5unjb1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

const connectDB = async () => {
  try {
    // Conectar a MongoDB utilizando el URI configurado
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected...');
  } catch (err) {
    console.error('Error connecting to MongoDB:', err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
