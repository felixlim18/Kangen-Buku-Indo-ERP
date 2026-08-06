import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, collection, getDocs, writeBatch } from "firebase/firestore";

// Mocking minimal app for Node env script to run against emulator/live, but wait!
// The agent doesn't have the firebase credentials to run a raw Node script against the live DB.
