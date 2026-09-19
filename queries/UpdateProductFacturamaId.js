module.exports = `
UPDATE products
SET facturama_product_id = $2,
    facturama_code_prod_serv = COALESCE($3, facturama_code_prod_serv),
    facturama_unit_code = COALESCE($4, facturama_unit_code),
    facturama_unit = COALESCE($5, facturama_unit)
WHERE id = $1
RETURNING *;
`;
