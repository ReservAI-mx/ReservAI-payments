module.exports = `
  INSERT INTO invoices (
    payment_history_id,
    info_fiscal_id,
    invoice_number,
    invoice_date,
    invoice_amount,
    status,
    facturama_invoice_id,
    facturama_invoice_url,
    facturama_uuid,
    pdf_storage_path,
    xml_storage_path
  ) VALUES (
    $1, $2, $3, $4, $5, 'stamped',
    $6, $7, $8, $9, $10
  )
  RETURNING *
`;
