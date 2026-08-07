import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { buildPerpetualIndex, buildReportRows, type PerpetualData } from '../src/lib/perpetual-inventory';
const sa=JSON.parse(readFileSync('/Users/Felixsalim/gen-lang-client-0501656267-firebase-adminsdk-fbsvc-35d61d1f5a.json','utf8'));
const app=initializeApp({credential:cert(sa),projectId:'gen-lang-client-0501656267'});
const db=getFirestore(app,'ai-studio-53e52a01-a8d6-4019-9f99-16eb3032e0f7');
const g=async(n:string,id=true)=>(await db.collection(n).get()).docs.map(d=>id?{id:d.id,...d.data()}:d.data()) as any[];
const ms=(v:any)=>v?.toDate?v.toDate().getTime():(typeof v?.seconds==='number'?v.seconds*1000:Date.parse(v));
(async()=>{
  const [books,inventoryList,ledgerEntries,purchaseOrders,salesOrders,journals,freightIn,damagedRecords]=
    await Promise.all([g('catalog'),g('inventory',false),g('inventoryLedger',false),g('purchaseOrders'),g('salesOrders'),g('journalEntries'),g('freightIn'),g('damagedStock',false)]);
  const idx=buildPerpetualIndex({books,inventoryList,ledgerEntries,purchaseOrders,salesOrders,journals,freightIn,damagedRecords} as PerpetualData, Date.parse('2026-08-07T12:00:00Z'));
  for(const m of ['2026-06','2026-07','2026-08']){
    const [y,mo]=m.split('-').map(Number); const cut=new Date(y,mo,1).getTime();
    const fisik=buildReportRows(idx as any,books,m).reduce((a,r)=>a+r.totalNilaiStok,0);
    let d=0,c=0; for(const j of journals){const t=ms(j.date); if(isNaN(t)||t>=cut)continue;
      for(const l of (j.lines||[])){const cc=(l.accountCode||'').trim();const nn=(l.account||'').trim().toLowerCase();
        if(cc==='1201'||cc==='1202'||nn==='inventory on hand'||nn==='inventory in delivery'){d+=l.debit||0;c+=l.credit||0;}}}
    console.log(`${m}  fisik ${(fisik/100).toFixed(2).padStart(10)}  GL ${((d-c)/100).toFixed(2).padStart(10)}  selisih ${(((d-c)-fisik)/100).toFixed(2).padStart(8)}`);
  }
  process.exit(0);
})();
