import { Timestamp } from 'firebase/firestore';

try {
  console.log('Timestamp.fromMillis(1394122982400):', Timestamp.fromMillis(1394122982400));
} catch (e: any) {
  console.error('fromMillis threw:', e.message);
}

try {
  console.log('Timestamp.fromDate(new Date(1394122982400)):', Timestamp.fromDate(new Date(1394122982400)));
} catch (e: any) {
  console.error('fromDate threw:', e.message);
}

try {
  // @ts-ignore
  console.log('new Timestamp(1394122982400, 0):', new Timestamp(1394122982400, 0));
} catch (e: any) {
  console.error('constructor threw:', e.message);
}
