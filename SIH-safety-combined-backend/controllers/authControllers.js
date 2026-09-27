const User = require("../models/user");
const bcrypt = require("bcryptjs");
const { generateToken } = require("../utils/tokenUtils");

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword
    });

    const safeUser = {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      created_at: newUser.created_at
    };

    res.status(201).json({
      message: "User registered successfully",
      user: safeUser
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      message: "Server error"
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(400).json({
        message: "Invalid email or password"
      });
    }

    const token = generateToken(user._id.toString());

    return res.status(200).json({
      message: "Login successful",
      token
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Server error"
    });
  }
};

module.exports = { registerUser, loginUser };
