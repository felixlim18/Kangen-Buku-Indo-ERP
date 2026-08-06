import fs from 'fs';
const journals = JSON.parse(fs.readFileSync('journals.json', 'utf8'));

let nets: number[] = [];
journals.forEach((j: any) => {
    let net = 0;
    if (j.lines) {
        j.lines.forEach((l: any) => {
            if (['1101', '1102'].includes(l.accountCode)) {
                net += (l.debit || 0) - (l.credit || 0);
            }
        });
    }
    if (net !== 0) {
        nets.push(net);
    }
});

let target = -224933;

function findSubsetSum(arr: number[], n: number, target: number, subset: number[]): boolean {
    if (target === 0) {
        console.log("Found subset:", subset);
        return true;
    }
    if (n === 0 && target !== 0) return false;
    
    // ignore very large subsets to save time
    if (subset.length > 3) return false;

    // Consider the last element
    if (findSubsetSum(arr, n - 1, target, subset)) return true;
    
    subset.push(arr[n - 1]);
    if (findSubsetSum(arr, n - 1, target - arr[n - 1], subset)) return true;
    subset.pop();
    
    return false;
}

findSubsetSum(nets, nets.length, target, []);
