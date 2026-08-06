const fs = require('fs');
let code = fs.readFileSync('src/components/CoaTab.tsx', 'utf8');

// Remove migrationNoticeVisible definition and setter
code = code.replace(/const \[migrationNoticeVisible, setMigrationNoticeVisible\] = useState\(false\);\n/g, '');
code = code.replace(/setMigrationNoticeVisible\(false\);\n/g, '');

// Remove handleRunMigration function
const handleRunMigrationStart = code.indexOf('const handleRunMigration = async () => {');
if (handleRunMigrationStart !== -1) {
    let bracketCount = 0;
    let i = handleRunMigrationStart;
    let foundFirstBracket = false;
    while (i < code.length) {
        if (code[i] === '{') {
            bracketCount++;
            foundFirstBracket = true;
        } else if (code[i] === '}') {
            bracketCount--;
        }
        if (foundFirstBracket && bracketCount === 0) {
            break;
        }
        i++;
    }
    const handleRunMigrationEnd = i + 1;
    code = code.substring(0, handleRunMigrationStart) + code.substring(handleRunMigrationEnd);
}

// Remove the banner JSX
const bannerStart = code.indexOf('{/* Migration Script Notice or Verification Status Banner */}');
if (bannerStart !== -1) {
    let bracketCount = 0;
    let i = code.indexOf('{migrationNoticeVisible && (', bannerStart);
    if (i !== -1) {
        let foundFirstBracket = false;
        while (i < code.length) {
            if (code[i] === '{') {
                bracketCount++;
                foundFirstBracket = true;
            } else if (code[i] === '}') {
                bracketCount--;
            }
            if (foundFirstBracket && bracketCount === 0) {
                break;
            }
            i++;
        }
        const bannerEnd = i + 1;
        code = code.substring(0, bannerStart) + code.substring(bannerEnd);
    }
}

fs.writeFileSync('src/components/CoaTab.tsx', code);
