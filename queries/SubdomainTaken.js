module.exports = `
    SELECT 1
    FROM technical_info
    WHERE subdomain = $1
    LIMIT 1
`;
