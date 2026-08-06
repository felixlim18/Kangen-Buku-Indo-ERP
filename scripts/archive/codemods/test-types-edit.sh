#!/bin/bash
sed -i '/discount: number;           \/\/ NTD cents/a \  platformFee?: number;       \/\/ NTD cents' src/types.ts
