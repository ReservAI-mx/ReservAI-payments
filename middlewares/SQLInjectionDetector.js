const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');

/**
 * SQLInjectionDetector - Middleware para detectar intentos de inyección SQL
 * 
 * Este middleware analiza el cuerpo de las requests en busca de patrones
 * sospechosos que podrían indicar intentos de inyección SQL.
 * 
 * IMPORTANTE: Los clientes NO pueden enviar queries directamente.
 * Solo pueden enviar datos sencillos que son procesados por queries
 * predefinidos en el servidor.
 */

class SQLInjectionDetector {
    // Patrones de inyección SQL comunes
    static suspiciousPatterns = [
        // Patrones de UNION
        /union\s+select/i,
        /union\s+all\s+select/i,
        /union\s+distinct\s+select/i,
        
        // Patrones de DROP
        /drop\s+table/i,
        /drop\s+database/i,
        /drop\s+index/i,
        /drop\s+view/i,
        
        // Patrones de INSERT
        /insert\s+into/i,
        /insert\s+values/i,
        
        // Patrones de DELETE
        /delete\s+from/i,
        /delete\s+where/i,
        
        // Patrones de UPDATE
        /update\s+set/i,
        /update\s+where/i,
        
        // Patrones de SELECT maliciosos
        /select\s+\*\s+from/i,
        /select\s+.*\s+from\s+information_schema/i,
        /select\s+.*\s+from\s+pg_/i,
        
        // Patrones de comentarios SQL
        /--\s*$/,
        /\/\*.*\*\//,
        
        // Patrones de escape
        /\\x[0-9a-fA-F]{2}/,
        /\\u[0-9a-fA-F]{4}/,
        
        // Patrones de concatenación
        /concat\s*\(/i,
        /char\s*\(/i,
        
        // Patrones de funciones peligrosas
        /load_file\s*\(/i,
        /into\s+outfile/i,
        /into\s+dumpfile/i,
        
        // Patrones de subconsultas maliciosas
        /select\s+.*\s+from\s+\(/i,
        /where\s+.*\s+in\s+\(/i,
        
        // Patrones de escape de comillas
        /'[\s]*or[\s]*'/i,
        /'[\s]*and[\s]*'/i,
        /'[\s]*union[\s]*'/i,
        
        // Patrones de números mágicos
        /1[\s]*=[\s]*1/i,
        /0[\s]*=[\s]*0/i,
        
        // Patrones de tiempo de espera
        /sleep\s*\(/i,
        /waitfor\s+delay/i,
        /benchmark\s*\(/i,
        
        // Patrones de información del sistema
        /version\s*\(/i,
        /user\s*\(/i,
        /database\s*\(/i,
        /@@version/i,
        /@@user/i,
        
        // Patrones de caracteres especiales peligrosos
        /[\x00-\x1f\x7f-\x9f]/,
        
        // Patrones de scripts
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        
        // Patrones de comandos del sistema
        /exec\s*\(/i,
        /system\s*\(/i,
        /shell_exec/i,
        /passthru/i,
        /proc_open/i,
        /popen/i,
        /eval\s*\(/i,
        /assert\s*\(/i
    ];

    /**
     * Analiza un string en busca de patrones de inyección SQL
     * @param {string} input - String a analizar
     * @returns {Object} - Resultado del análisis
     */
    static analyzeInput(input) {
        if (!input || typeof input !== 'string') {
            return { isSafe: true, threats: [] };
        }

        const threats = [];
        const inputLower = input.toLowerCase();

        // Verificar cada patrón sospechoso
        this.suspiciousPatterns.forEach((pattern, index) => {
            if (pattern.test(input)) {
                threats.push({
                    pattern: pattern.toString(),
                    index: index,
                    match: input.match(pattern)?.[0] || 'Match found'
                });
            }
        });

        return {
            isSafe: threats.length === 0,
            threats: threats,
            inputLength: input.length,
            suspiciousChars: this.countSuspiciousChars(input)
        };
    }

    /**
     * Cuenta caracteres sospechosos en el input
     * @param {string} input - String a analizar
     * @returns {Object} - Conteo de caracteres sospechosos
     */
    static countSuspiciousChars(input) {
        const suspiciousChars = {
            quotes: (input.match(/'/g) || []).length,
            doubleQuotes: (input.match(/"/g) || []).length,
            semicolons: (input.match(/;/g) || []).length,
            parentheses: (input.match(/[()]/g) || []).length,
            brackets: (input.match(/[\[\]]/g) || []).length,
            backslashes: (input.match(/\\/g) || []).length,
            nullBytes: (input.match(/\x00/g) || []).length,
            controlChars: (input.match(/[\x00-\x1f\x7f-\x9f]/g) || []).length
        };

        return suspiciousChars;
    }

    /**
     * Middleware principal para detectar inyección SQL
     */
    static middleware() {
        return (req, res, next) => {
            try {
                // Analizar el cuerpo de la request
                if (req.body && typeof req.body === 'object') {
                    const bodyString = JSON.stringify(req.body);
                    const analysis = this.analyzeInput(bodyString);

                    if (!analysis.isSafe) {
                        logAction(req, 'warning', 'SQLInjectionDetector', 'body');

                        return res.status(400).json({
                            error: 'Request contains potentially malicious content',
                            code: 'SECURITY_VIOLATION',
                            message: 'Invalid request format detected'
                        });
                    }
                }

                // Analizar query parameters
                if (req.query && typeof req.query === 'object') {
                    const queryString = JSON.stringify(req.query);
                    const analysis = this.analyzeInput(queryString);

                    if (!analysis.isSafe) {
                        logAction(req, 'warning', 'SQLInjectionDetector', 'query');

                        return res.status(400).json({
                            error: 'Query parameters contain potentially malicious content',
                            code: 'SECURITY_VIOLATION',
                            message: 'Invalid query format detected'
                        });
                    }
                }

                // Analizar headers sospechosos
                const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-originating-ip'];
                for (const header of suspiciousHeaders) {
                    const headerValue = req.get(header);
                    if (headerValue) {
                        const analysis = this.analyzeInput(headerValue);
                        if (!analysis.isSafe) {
                            logAction(req, 'warning', 'SQLInjectionDetector', `header=${header}`);

                            return res.status(400).json({
                                error: 'Headers contain potentially malicious content',
                                code: 'SECURITY_VIOLATION',
                                message: 'Invalid header format detected'
                            });
                        }
                    }
                }

                addRequestTraceStep(req, 'SQLInjectionDetector', { ok: true });
                next();
            } catch (error) {
                logAction(req, 'error', 'SQLInjectionDetector', 'detector failed', error);
                // En caso de error, permitir que continúe pero logear
                next();
            }
        };
    }
}

module.exports = SQLInjectionDetector;
