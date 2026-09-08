module.exports = `
    UPDATE technical_info
    SET status = $2
    WHERE id = $1
    RETURNING id, status, subdomain
`;
