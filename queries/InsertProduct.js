module.exports = `
  INSERT INTO products (
    name,
    description,
    monthly_amount,
    setup_amount,
    stripe_product_id,
    stripe_price_id_monthly,
    stripe_price_id_monthly_moral,
    stripe_price_id_setup,
    stripe_price_id_setup_moral,
    facturama_product_id,
    facturama_code_prod_serv,
    facturama_unit_code,
    facturama_unit,
    active
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true)
  RETURNING *
`;
