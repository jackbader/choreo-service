import express from "express";
import cache from "./cache.mjs";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbPassword = process.env.DATABASE_PASSWORD;
const { Pool } = pg;
const pool = new Pool({
  user: 'avnadmin',
  host: 'pg-6f5c9083-f3da-46b6-8e0e-5059b0eeeadc-booksda2350796403-chore.h.aivencloud.com',
  database: 'defaultdb',
  password: dbPassword,
  port: 27760,
  ssl: {
    rejectUnauthorized: true,
    ca: fs.readFileSync('./postgres-ca.pem').toString(),
  },
});

pool.connect((err) => {
  if (err) {
    console.error('Connection error', err.stack);
  } else {
    console.log('Connected to the database');
  }
});

// add a book - request body should contain a title, status and an author
app.post("/reading-list/books", async (req, res) => {
  const { title, author, status } = req.body;
  if (!(status === "read" || status === "to_read" || status === "reading")) {
    return res.status(400).json({
      error: "Status is invalid. Accepted statuses: read | to_read | reading",
    });
  }
  if (!title || !author || !status) {
    return res.status(400).json({ error: "Title, Status or Author is empty" });
  }
  const value = {  title, author, status };

  try {
    await pool.query('INSERT INTO books (title, author, status) VALUES ($1, $2, $3)', [title, author, status]);
    return res.status(201).json(value);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// update status of a book by uuid
app.put("/reading-list/books/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  const { status } = req.body;
  if (!uuid || typeof uuid !== "string") {
    return res.status(400).json({ error: "missing or invalid UUID" });
  }
  if (!cache.has(uuid)) {
    return res.status(404).json({ error: "UUID does not exist" });
  }
  if (!(status === "read" || status === "to_read" || status === "reading")) {
    return res.status(400).json({
      error: "Status is invalid. Accepted statuses: read | to_read | reading",
    });
  }
  const value = cache.get(uuid);
  value.status = status;
  cache.set(uuid, value);
  return res.json({ uuid, status });
});

// get the list of books
app.get("/reading-list/books", async (_, res) => {
  try {
    const result = await pool.query('SELECT * FROM books');
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// get a book by uuid
app.get("/reading-list/books/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  if (!uuid || typeof uuid !== "string") {
    return res.status(400).json({ error: "missing or invalid UUID" });
  }
  if (!cache.has(uuid)) {
    return res.status(404).json({ error: "UUID does not exist" });
  }
  const value = cache.get(uuid);
  return res.json(value);
});

// delete a book by uuid
app.delete("/reading-list/books/:uuid", async (req, res) => {
  const uuid = req.params.uuid;
  if (!uuid || typeof uuid !== "string") {
    return res.status(400).json({ error: "missing or invalid UUID" });
  }

  try {
    const result = await pool.query('DELETE FROM books WHERE id = $1 RETURNING *', [uuid]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "UUID does not exist" });
    }
    return res.json({ uuid });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// health check
app.get("/healthz", (_, res) => {
  return res.sendStatus(200);
});

app.use((err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(err);
  res.status(500);
  res.json({ error: err.message });
});

app.use("*", (_, res) => {
  return res
    .status(404)
    .json({ error: "the requested resource does not exist on this server" });
});

export default app;
