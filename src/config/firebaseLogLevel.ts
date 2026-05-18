/**
 * Must be imported first, before any other Firebase code.
 * Suppresses Firebase SDK logs (Auth, Firestore, etc.) from appearing in LogBox.
 */
import { setLogLevel } from 'firebase/app';

setLogLevel('silent');
