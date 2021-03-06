const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const admin = require("firebase-admin");
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
const { query } = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const fileUpload = require("express-fileupload");
// const port = 5000;
const port = process.env.PORT || 5000;
//middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.i4wg8.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith("Bearer ")) {
    const token = req.headers.authorization.split(" ")[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email;
    } catch {}
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("Doctors_Portal");
    const AppointmentsCollection = database.collection("appointments");
    const UsersCollection = database.collection("users");
    const doctorsCollection = database.collection("doctors");

    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;
      // const date = new Date(req.query.date).toLocaleDateString();
      const query = { email: email, date: date };
      const cursor = AppointmentsCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    });
    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: ObjectId(id) };
      const result = await AppointmentsCollection.findOne(query);
      res.json(result);
    });
    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await AppointmentsCollection.updateOne(filter, updateDoc);
      res.json(result);
    });
    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      const result = await AppointmentsCollection.insertOne(appointment);
      res.json(result);
    });
    app.get("/doctors", async (req, res) => {
      const cursor = doctorsCollection.find({});
      const doctors = await cursor.toArray();
      res.json(doctors);
    });
    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const image = req.files.image;
      const imageData = image.data;
      const encodedImage = imageData.toString("base64");
      const imageBuffer = Buffer.from(encodedImage, "base64");
      const doctor = {
        name,
        email,
        image: imageBuffer,
      };
      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await UsersCollection.insertOne(user);
      console.log(result);
      res.json(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await UsersCollection.findOne(query);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await UsersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      console.log(req.decodedEmail, "hello");
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await UsersCollection.findOne({
          email: requester,
        });
        if (requesterAccount?.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = {
            $set: {
              role: "admin",
            },
          };

          const result = await UsersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ message: "you do not have access to make admin " });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100; // 1 dollar = 100 cent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to Doctors Portal");
});

app.listen(port, () => {
  console.log("listening to ", port);
});
