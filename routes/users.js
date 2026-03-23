var express = require("express");
var router = express.Router();
let { postUserValidator, validateResult } = require('../utils/validatorHandler')
let userController = require('../controllers/users')
let cartModel = require('../schemas/cart');
let { checkLogin, checkRole } = require('../utils/authHandler.js')
let { uploadExcel } = require('../utils/uploadHandler')
let excelJS = require('exceljs')
let fs = require('fs')
let path = require('path')
let crypto = require('crypto')
let mailHandler = require('../utils/sendMailHandler')
let roleModel = require("../schemas/roles");

let userModel = require("../schemas/users");
const { default: mongoose } = require("mongoose");
//- Strong password

function generateRandomPassword() {
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const symbols = "!@#$%^&*";
  const allChars = lowercase + uppercase + numbers + symbols;
  const requiredChars = [
    lowercase[crypto.randomInt(lowercase.length)],
    uppercase[crypto.randomInt(uppercase.length)],
    numbers[crypto.randomInt(numbers.length)],
    symbols[crypto.randomInt(symbols.length)]
  ];

  while (requiredChars.length < 16) {
    requiredChars.push(allChars[crypto.randomInt(allChars.length)]);
  }

  for (let i = requiredChars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [requiredChars[i], requiredChars[j]] = [requiredChars[j], requiredChars[i]];
  }

  return requiredChars.join('');
}

function getCellValue(cell) {
  if (!cell) {
    return "";
  }
  const value = cell.value;
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    if (value.text) {
      return String(value.text).trim();
    }
    if (value.hyperlink) {
      return String(value.hyperlink).trim();
    }
    if (value.result) {
      return String(value.result).trim();
    }
  }
  return String(value).trim();
}

async function readImportRows(filePath) {
  const workbook = new excelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("File excel khong co worksheet");
  }

  const headerMap = {};
  worksheet.getRow(1).eachCell(function (cell, colNumber) {
    const key = getCellValue(cell).toLowerCase();
    if (key) {
      headerMap[key] = colNumber;
    }
  });

  const usernameColumn = headerMap.username;
  const emailColumn = headerMap.email;

  if (!usernameColumn || !emailColumn) {
    throw new Error("File excel phai co 2 cot username va email");
  }

  const rows = [];
  for (let index = 2; index <= worksheet.rowCount; index++) {
    const row = worksheet.getRow(index);
    const username = getCellValue(row.getCell(usernameColumn));
    const email = getCellValue(row.getCell(emailColumn)).toLowerCase();
    if (!username && !email) {
      continue;
    }
    rows.push({
      rowNumber: index,
      username,
      email
    });
  }
  return rows;
}

router.get("/", checkLogin,
  checkRole("ADMIN", "MODERATOR"), async function (req, res, next) {
    let users = await userModel
      .find({ isDeleted: false })
      .populate({
        'path': 'role',
        'select': "name"
      })
    res.send(users);
  });

router.get("/:id", checkLogin, async function (req, res, next) {
  try {
    let result = await userModel
      .find({ _id: req.params.id, isDeleted: false })
    if (result.length > 0) {
      res.send(result);
    }
    else {
      res.status(404).send({ message: "id not found" });
    }
  } catch (error) {
    res.status(404).send({ message: "id not found" });
  }
});

router.post("/",  postUserValidator, validateResult,
  async function (req, res, next) {
    let session = await mongoose.startSession()
    let transaction = session.startTransaction()
    try {
      let newItem = await userController.CreateAnUser(
        req.body.username,
        req.body.password,
        req.body.email,
        req.body.role,
        session
      )
      let newCart = new cartModel({
        user: newItem._id
      })
      let result = await newCart.save({ session })
      result = await result.populate('user')
      session.commitTransaction();
      session.endSession()
      res.send(result)
    } catch (err) {
      session.abortTransaction()
      session.endSession()
      res.status(400).send({ message: err.message });
    }
  });

router.post("/import", checkLogin, checkRole("ADMIN", "MODERATOR"), uploadExcel.single('file'), async function (req, res, next) {
  let pathFile = req.file
    ? path.join(__dirname, '../uploads', req.file.filename)
    : path.join(__dirname, '../user.xlsx');

  try {
    if (!fs.existsSync(pathFile)) {
      return res.status(404).send({
        message: "Khong tim thay file import user.xlsx"
      });
    }

    const userRole = await roleModel.findOne({
      name: { $regex: /^user$/i },
      isDeleted: false
    });

    if (!userRole) {
      return res.status(400).send({
        message: "Khong tim thay role user. Hay tao role user truoc khi import."
      });
    }

    const rows = await readImportRows(pathFile);
    const results = [];
    const seenUsernames = new Set();
    const seenEmails = new Set();

    for (const row of rows) {
      const errors = [];
      const normalizedUsername = row.username.trim();
      const normalizedEmail = row.email.trim().toLowerCase();

      if (!normalizedUsername) {
        errors.push("username khong duoc de trong");
      }
      if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
        errors.push("email khong dung dinh dang");
      }
      if (seenUsernames.has(normalizedUsername.toLowerCase())) {
        errors.push("username bi trung trong file");
      }
      if (seenEmails.has(normalizedEmail)) {
        errors.push("email bi trung trong file");
      }

      const existedUser = errors.length === 0
        ? await userModel.findOne({
          $or: [
            { username: normalizedUsername },
            { email: normalizedEmail }
          ]
        })
        : null;

      if (existedUser) {
        if (existedUser.username === normalizedUsername) {
          errors.push("username da ton tai");
        }
        if (existedUser.email === normalizedEmail) {
          errors.push("email da ton tai");
        }
      }

      if (errors.length > 0) {
        results.push({
          row: row.rowNumber,
          success: false,
          message: errors.join(", ")
        });
        continue;
      }

      const password = generateRandomPassword();
      try {
        const newUser = await userController.CreateAnUser(
          normalizedUsername,
          password,
          normalizedEmail,
          userRole._id
        );

        const newCart = new cartModel({
          user: newUser._id
        });
        try {
          await newCart.save();
        } catch (cartError) {
          await userModel.findByIdAndDelete(newUser._id);
          throw cartError;
        }

        seenUsernames.add(normalizedUsername.toLowerCase());
        seenEmails.add(normalizedEmail);

        let mailMessage = "Da tao user va gui email thanh cong";
        try {
          await mailHandler.sendUserCredentialMail(normalizedEmail, normalizedUsername, password);
        } catch (mailError) {
          mailMessage = "Da tao user nhung gui email that bai: " + mailError.message;
        }

        results.push({
          row: row.rowNumber,
          success: true,
          username: normalizedUsername,
          email: normalizedEmail,
          message: mailMessage
        });
      } catch (error) {
        results.push({
          row: row.rowNumber,
          success: false,
          username: normalizedUsername,
          email: normalizedEmail,
          message: error.message
        });
      }
    }

    res.send({
      total: rows.length,
      success: results.filter(item => item.success).length,
      failed: results.filter(item => !item.success).length,
      results
    });
  } catch (error) {
    res.status(400).send({ message: error.message });
  } finally {
    if (req.file && fs.existsSync(pathFile)) {
      fs.unlinkSync(pathFile);
    }
  }
});

router.put("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findById(id);
    for (const key of Object.keys(req.body)) {
      updatedItem[key] = req.body[key];
    }
    await updatedItem.save();

    if (!updatedItem) return res.status(404).send({ message: "id not found" });

    let populated = await userModel
      .findById(updatedItem._id)
    res.send(populated);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

router.delete("/:id", async function (req, res, next) {
  try {
    let id = req.params.id;
    let updatedItem = await userModel.findByIdAndUpdate(
      id,
      { isDeleted: true },
      { new: true }
    );
    if (!updatedItem) {
      return res.status(404).send({ message: "id not found" });
    }
    res.send(updatedItem);
  } catch (err) {
    res.status(400).send({ message: err.message });
  }
});

module.exports = router;
