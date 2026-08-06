const fs = require('fs');
let code = fs.readFileSync('src/components/SalesTab.tsx', 'utf8');

code = code.replace(
  "{filteredPlatformsByPayment.map((p, pIdx) => (\n                              <option key={`${p.id || p.name}-${pIdx}`} value={p.name}>{p.name}</option>\n                            ))}\n                            {platformOrder && !filteredPlatformsByPayment.some(p => p.name === platformOrder) && (\n                              <option value={platformOrder}>{platformOrder}</option>\n                            )}",
  "{(buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment).map((p, pIdx) => (\n                              <option key={`${p.id || p.name}-${pIdx}`} value={p.name}>{p.name}</option>\n                            ))}\n                            {platformOrder && !(buyerType === 'marketplace' ? resolvedMarketplaces : filteredPlatformsByPayment).some(p => p.name === platformOrder) && (\n                              <option value={platformOrder}>{platformOrder}</option>\n                            )}"
);

fs.writeFileSync('src/components/SalesTab.tsx', code);
