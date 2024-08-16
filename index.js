const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
dotenv.config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration
const corsOptions = {
  origin: "http://localhost:5173", // Frontend URL
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// middlewares
app.use(cors(corsOptions));
app.use(express.json());

app.get("/", async (req, res) => {
  res.send("Hello jonogon");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tdvhb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // collections
    const userCollections = client
      .db("expenseManagementDB")
      .collection("users");
    const shoppingCollections = client
      .db("expenseManagementDB")
      .collection("shopping");
    const shoppingListCollections = client
      .db("expenseManagementDB")
      .collection("shoppingList");

    // jwt generate
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // middleweares
    const verifyToken = (req, res, next) => {
      // console.log("inside: ", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorised access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollections.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // get admin with verification
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const user = await userCollections.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // users api

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollections.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }
      const result = await userCollections.insertOne(user);
      res.send(result);
    });

    // Shopping List
    app.get("/shoppingList", async (req, res) => {
      const result = await shoppingListCollections.find().toArray();
      res.send(result);
    });

    // all shopping
    app.get("/shopping", async (req, res) => {
      const result = await shoppingCollections
        .find()
        .sort({ _id: -1 })
        .toArray();
      res.status(200).send(result);
    });
    app.post("/shopping", async (req, res) => {
      const shopping = req.body;

      const result = await shoppingCollections.insertOne(shopping);

      res.status(200).json(result);
    });

    app.get("/shopping/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await shoppingCollections.findOne(query);
      res.send(result);
    });

    // new item push in array

    app.post("/shopping/:id", async (req, res) => {
      const id = req.params.id; // Document ID from the route parameter
      const newItem = req.body; // New item from the request body

      try {
        // Generate a custom _id similar to existing ones
        const customId = new ObjectId().toHexString(); // Generates a 24-character hexadecimal string

        // Assign the custom _id to the new item
        newItem._id = customId;

        // Find the document by its _id and push the new item into the checkedItems array
        const result = await shoppingCollections.updateOne(
          { _id: new ObjectId(id) }, // Query to match the document by its _id
          { $push: { checkedItems: newItem } } // Push the new item into the checkedItems array
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .send({ error: "Document not found or item not added" });
        }

        res
          .status(200)
          .send({ message: "Item added successfully", item: newItem });
      } catch (error) {
        console.error("Error adding item:", error);
        res.status(500).send({ error: "Failed to add item" });
      }
    });

    app.delete("/shopping/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await shoppingCollections.deleteOne(query);
      res.send(result);
    });

    // get single from array

    app.get("/shopping/:documentId/item/:itemId", async (req, res) => {
      const { documentId, itemId } = req.params;

      try {
        // Find the document by its _id
        const document = await shoppingCollections.findOne({
          _id: new ObjectId(documentId),
        });

        if (!document) {
          return res.status(404).send({ error: "Document not found" });
        }

        // Find the specific item within the checkedItems array
        const item = document.checkedItems.find(
          (item) => item._id.toString() === itemId
        );

        if (!item) {
          return res.status(404).send({ error: "Item not found" });
        }

        res.status(200).send({
          message: "Item retrieved successfully",
          item: item,
        });
      } catch (error) {
        console.error("Error retrieving item:", error);
        res.status(500).send({ error: "Failed to retrieve item" });
      }
    });

    // update single data from array
    app.patch("/shopping/:documentId/item/:itemId", async (req, res) => {
      const { documentId, itemId } = req.params;
      const updateData = req.body; // The data to update (e.g., name, quantity, unit)

      try {
        // Find the document by its _id and update the specific item in the checkedItems array
        const result = await shoppingCollections.updateOne(
          { _id: new ObjectId(documentId), "checkedItems._id": itemId }, // Match the document and the specific item
          {
            $set: {
              "checkedItems.$.name": updateData.name,
              "checkedItems.$.quantity": updateData.quantity,
              "checkedItems.$.unit": updateData.unit,
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ error: "Document or item not found" });
        }

        res.status(200).send({ message: "Item updated successfully" });
      } catch (error) {
        console.error("Error updating item:", error);
        res.status(500).send({ error: "Failed to update item" });
      }
    });

    // delete single data from array

    app.delete("/shopping/:documentId/item/:itemId", async (req, res) => {
      const { documentId, itemId } = req.params;

      try {
        const result = await shoppingCollections.updateOne(
          { _id: new ObjectId(documentId) },
          { $pull: { checkedItems: { _id: itemId } } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "Item not found" });
        }

        res.status(200).send({ message: "Item deleted successfully" });
      } catch (error) {
        console.error("Error deleting item:", error);
        res.status(500).send({ error: "Failed to delete item" });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`server is running on port: ${port}`);
});
