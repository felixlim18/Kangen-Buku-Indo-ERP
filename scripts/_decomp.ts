import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { buildPerpetualIndex, buildReportRows, type PerpetualData } from '../src/lib/perpetual-inventory';
const sa=JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json','utf8'));
const app=initializeApp({credential:cert(sa),projectId:'gen-lang-client-0501656267'});
const db=getFirestore(app,'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const g=async(n:string,id=true)=>(await db.collection(n).get()).docs.map(d=>id?{id:d.id,...d.data()}:d.data()) as any[];
(async()=>{
  const [books,inventoryList,ledgerEntries,purchaseOrders,salesOrders,journals,freightIn,damagedRecords]=
    await Promise.all([g('catalog'),g('inventory',false),g('inventoryLedger',false),g('purchaseOrders'),g('salesOrders'),g('journalEntries'),g('freightIn'),g('damagedStock',false)]);
  const data={books,inventoryList,ledgerEntries,purchaseOrders,salesOrders,journals,freightIn,damagedRecords} as PerpetualData;
  const idx:any=buildPerpetualIndex(data, Date.parse('2026-08-07T12:00:00Z'));

  // GL total (seluruh waktu)
  let gd=0,gc=0;
  for(const j of journals) for(const l of (j.lines||[])){const c=(l.accountCode||'').trim();const n=(l.account||'').trim().toLowerCase();
    if(c==='1201'||c==='1202'||n==='inventory on hand'||n==='inventory in delivery'){gd+=l.debit||0;gc+=l.credit||0;}}
  const GL=gd-gc;

  // sisi replay
  let inflow=0,freight=0,outflow=0,end=0;
  for(const b of books){const evs=idx.eventsByBook.get(b.id); if(!evs)continue;
    let s=idx.initialStockByBook.get(b.id)||0,v=0,a=0;
    for(const e of evs){ if(e.type==='purchase_received'){s+=e.qtyDelta;v+=e.cost;inflow+=e.cost;a=s>0?v/s:0;}
      else if(e.type==='freight_capitalized'){v+=e.freightAllocatedCents;freight+=e.freightAllocatedCents;a=s>0?v/s:0;}
      else {const h=e.qtyDelta*a;const bv=v;s=Math.max(0,s-e.qtyDelta);v=Math.max(0,v-h);outflow+=bv-v;} }
    end+=v;}

  // freight: dijurnal vs teralokasi
  let capJ=0; const codes=new Map<string,number>();
  for(const j of journals){ if(!String(j.description||'').toUpperCase().includes('KAPITALISASI'))continue;
    let d=0; for(const l of (j.lines||[])){const c=(l.accountCode||'').trim(); if(c==='1201'||c==='1202')d+=l.debit||0;}
    if(d){capJ+=d; codes.set(String(j.description).split(' ')[0].toUpperCase().trim(),d);} }

  const f=(c:number)=>(c/100).toFixed(2).padStart(11);
  console.log('SISI REPLAY (seluruh waktu)');
  console.log('  masuk     '+f(inflow)+'\n  freight   '+f(freight)+'\n  keluar    '+f(-outflow)+'\n  = nilai   '+f(end));
  console.log('\nGL 1201+1202  '+f(GL));
  console.log('SELISIH       '+f(GL-end));
  console.log('\nKomponen:');
  console.log('  freight dijurnal '+f(capJ)+'  teralokasi '+f(freight)+'  -> belum teralokasi '+f(capJ-freight));
  const inCat=new Set(books.map(b=>b.id)); let orphan=0;
  for(const [bid] of idx.eventsByBook) if(!inCat.has(bid)) orphan++;
  console.log('  buku yatim tersisa: '+orphan);
  console.log('  sisanya (penilaian keluar + pembulatan): '+f((GL-end)-(capJ-freight)));
  process.exit(0);
})();
