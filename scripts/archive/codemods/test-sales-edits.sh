#!/bin/bash
# Adding platformFeeInput state
sed -i 's/const \[discountInput, setDiscountInput\] = useState(.0.);/const \[discountInput, setDiscountInput\] = useState('\''0'\'');\n  const \[platformFeeInput, setPlatformFeeInput\] = useState('\''0'\'');/g' src/components/SalesTab.tsx
