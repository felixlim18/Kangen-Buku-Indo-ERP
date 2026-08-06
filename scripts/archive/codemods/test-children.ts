import fs from 'fs';

const allAccounts = JSON.parse(fs.readFileSync('coa.json', 'utf8'));

function isDescendantOf(acc: any, parent: any, allAccs: any[]): boolean {
  if (!acc.parentAccount) return false;
  
  let currentParentStr = acc.parentAccount.trim().toLowerCase();
  
  let safety = 0;
  while (currentParentStr && safety < 10) {
    if (
      currentParentStr === parent.name.trim().toLowerCase() ||
      currentParentStr === `${parent.code} - ${parent.name}`.trim().toLowerCase() ||
      currentParentStr === parent.id.trim().toLowerCase() ||
      currentParentStr === parent.code.trim().toLowerCase()
    ) {
      return true;
    }
    
    const nextParentObj = allAccs.find(a => 
      a.name.trim().toLowerCase() === currentParentStr ||
      `${a.code} - ${a.name}`.trim().toLowerCase() === currentParentStr ||
      a.id.trim().toLowerCase() === currentParentStr ||
      a.code.trim().toLowerCase() === currentParentStr
    );
    
    if (nextParentObj && nextParentObj.parentAccount) {
      currentParentStr = nextParentObj.parentAccount.trim().toLowerCase();
    } else {
      break;
    }
    safety++;
  }
  
  return false;
}

const acc1100 = allAccounts.find((a: any) => a.code === '1100');

let children = allAccounts.filter((a: any) => isDescendantOf(a, acc1100, allAccounts));

console.log("Children of 1100:");
children.forEach((c: any) => console.log(c.code, c.name));

