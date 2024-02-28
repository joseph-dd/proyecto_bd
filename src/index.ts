import { plainToClass } from "class-transformer";
import { validateOrReject } from "class-validator";
import dotenv from "dotenv";
import "es6-shim";
import express, { Express, Request, Response } from "express";
import { Pool } from "pg";
import "reflect-metadata";
import { Board } from "./dto/board.dto";
import { User } from "./dto/user.dto";
import { List } from "./dto/list.dto";
import { Card } from "./dto/card.dto";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: +process.env.DB_PORT!,
});

const app: Express = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// GET: Retrieve all users
app.get("/users", async (req: Request, res: Response) => {
  try {
    const query = "SELECT id, name, email FROM users";
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    return res.status(400).json(error);
  }
});

// POST: Create a new user
app.post("/users", async (req: Request, res: Response) => {
  let userDto: User = plainToClass(User, req.body);
  try {
    await validateOrReject(userDto);

    const query = "INSERT INTO users(name, email) VALUES($1, $2) RETURNING *";
    const values = [userDto.name, userDto.email];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(422).json(error);
  }
});

// GET: Retrieve all boards where the user is an admin
app.get("/boards", async (req: Request, res: Response) => {
  try {
    const query =
      'SELECT b.id, b.name, bu.userId "adminUserId" FROM boards b JOIN board_users bu ON bu.boardId = b.id WHERE bu.isAdmin IS true';
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    return res.status(400).json(error);
  }
});

// POST: Create a new board
app.post("/boards", async (req: Request, res: Response) => {
  let boardDto: Board = plainToClass(Board, req.body);
  const client = await pool.connect();
  try {
    client.query("BEGIN");
    await validateOrReject(boardDto, {});

    const boardQuery = "INSERT INTO boards(name) VALUES($1) RETURNING *";
    const boardValues = [boardDto.name];
    const boardResult = await client.query(boardQuery, boardValues);

    const boardUserQuery =
      "INSERT INTO board_users(boardId, userId, isAdmin) VALUES($1, $2, $3)";
    const boardUserValues = [
      boardResult.rows[0].id,
      boardDto.adminUserId,
      true,
    ];
    await client.query(boardUserQuery, boardUserValues);

    client.query("COMMIT");
    res.status(201).json(boardResult.rows[0]);
  } catch (error) {
    client.query("ROLLBACK");
    return res.status(422).json(error);
  } finally {
    client.release();
  }
});

// GET: Retrieve all lists for a specific board
app.get("/boards/lists", async (req: Request, res: Response) => {
  try {
    const boardId = req.query.boardId as string;

    if (!boardId) {
      return res.status(400).json({ error: "Missing boardId parameter" });
    }

    const query =
      "SELECT id, name FROM lists WHERE boardId = $1";
    const values = [boardId];
    const result = await pool.query(query, values);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST: Create a new list
app.post("/boards/lists", async (req: Request, res: Response) => {
  try {
    const listDto: List = plainToClass(List, req.body);

    // Validate DTO using class-validator
    await validateOrReject(listDto);

    const query =
      "INSERT INTO lists(name, boardId) VALUES($1, $2) RETURNING *";
    const values = [listDto.name, listDto.boardId];
    const result = await pool.query(query, values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(422).json(error);
  }
});

// POST: Create a new card for a specific list
app.post("/boards/lists/cards", async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const cardDto: Card = plainToClass(Card, req.body);

    // Validate DTO using class-validator
    await validateOrReject(cardDto, {});

    client.query("BEGIN");

    // Get current date and time if dueDate is not provided
    const date = cardDto.dueDate ? new Date(cardDto.dueDate) : new Date();

    // Insert new card into "cards" table with default dueDate
    const cardQuery =
      "INSERT INTO cards(name, description, dueDate, listId) VALUES($1, $2, $3, $4) RETURNING id";
    const cardValues = [
      cardDto.name,
      cardDto.description,
      date,
      cardDto.listId,
    ];
    const cardResult = await client.query(cardQuery, cardValues);
    const cardId = cardResult.rows[0].id;

    // Insert card owner into "card_users" table
    const cardOwnerQuery =
      "INSERT INTO card_users(userId, cardId, isOwner) VALUES($1, $2, true)";
    const cardOwnerValues = [cardDto.ownerUserId, cardId];
    await client.query(cardOwnerQuery, cardOwnerValues);

    client.query("COMMIT");

    res.status(201).json({ cardId });
  } catch (error) {
    client.query("ROLLBACK");
    console.error(error);
    return res.status(422).json(error);
  } finally {
    client.release();
  }
});

// POST: Add a member to a specific card
app.post("/boards/lists/cards/members", async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { cardId, userId } = req.body;

    // Check if the card exists
    const checkCardQuery = "SELECT * FROM cards WHERE id = $1";
    const checkCardValues = [cardId];
    const checkCardResult = await client.query(checkCardQuery, checkCardValues);

    if (checkCardResult.rows.length === 0) {
      return res.status(404).json({ error: "Card not found." });
    }

    // Check if the user is not the owner of the card
    const checkOwnershipQuery =
      "SELECT 1 FROM card_users WHERE cardId = $1 AND userId = $2 AND isOwner = true";
    const checkOwnershipValues = [cardId, userId];
    const checkOwnershipResult = await client.query(checkOwnershipQuery, checkOwnershipValues);

    if (checkOwnershipResult.rows.length > 0) {
      return res.status(403).json({ error: "User is already the owner of the card." });
    }

    client.query("BEGIN");

    // Add member to "card_users" table
    const addMemberQuery =
      "INSERT INTO card_users(userId, cardId, isOwner) VALUES($1, $2, false)";
    const addMemberValues = [userId, cardId];
    const result = await client.query(addMemberQuery, addMemberValues);

    client.query("COMMIT");

    res.status(201).json(result.rows[0]);
  } catch (error) {
    client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error." });
  } finally {
    client.release();
  }
});

// GET: Retrieve all cards for a specific list
app.get("/boards/lists/cards", async (req: Request, res: Response) => {
  const { listId } = req.query;

  if (!listId) {
    return res.status(400).json({ error: "Missing listId parameter" });
  }

  const client = await pool.connect();

  try {
    const query = `
      SELECT c.id, c.name, c.description, c.dueDate, cu.isOwner, u.name as ownerName
      FROM cards c
      INNER JOIN card_users cu ON c.id = cu.cardId
      INNER JOIN users u ON cu.userId = u.id
      WHERE c.listId = $1
    `;

    const values = [listId];

    const result = await client.query(query, values);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error." });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
