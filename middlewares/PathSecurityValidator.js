const { addRequestTraceStep, logAction } = require('../utils/RequestTrace');

class PathSecurityValidator {
    // Extensiones de archivos sensibles
    static sensitiveExtensions = [
        '.env',
        '.env.local',
        '.env.production',
        '.pem',
        '.ppk',
        '.key',
        '.crt',
        '.p12',
        '.pfx',
        '.js',
        '.json',
        '.ini',
        '.conf',
        '.log',
        '.sql',
        '.db',
        '.sqlite',
        '.mdb',
        '.bak',
        '.backup',
        '.sh',
        '.bat',
        '.ps1',
        '.exe',
        '.dll'
    ];

    // Directorios prohibidos
    static forbiddenDirectories = [
        'node_modules',
        '.git',
        '.ssh',
        'certificates',
        'logs',
        'secrets',
        'private',
        '.aws',
        '.azure',
        '.docker',
        '.kube',
        'testing'
    ];

    // Archivos específicos protegidos
    static protectedFiles = [
        'server.js',
        'package.json',
        'package-lock.json',
        'config.js',
        'config.json',
        'web.config',
        '.htaccess',
        '.htpasswd',
        'id_rsa'
    ];

    // Patrones de path traversal
    static pathTraversalPatterns = [
        /\.\.\//g,                    // ../
        /\.\.\\/g,                    // ..\
        /\.\.%2f/gi,                  // ..%2f (URL encoded)
        /\.\.%5c/gi,                  // ..%5c (URL encoded backslash)
        /%2e%2e%2f/gi,                // %2e%2e%2f (double encoded)
        /%2e%2e%5c/gi,                // %2e%2e%5c (double encoded)
        /\.\.%252f/gi,                // ..%252f (triple encoded)
        /\.\.\.\//g,                  // .../
        /\.\.\.\.\//g,                // ..../
        /%00/g,                       // Null byte
        /\\x00/g,                     // Null byte hex
        /\.\./g                       // .. (cualquier ocurrencia)
    ];

    // Patrones de sistema
    static systemPatterns = [
        /\/etc\//gi,
        /\/proc\//gi,
        /\/sys\//gi,
        /c:\\/gi,
        /windows\\/gi,
        /system32/gi
    ];

    /**
     * Verifica si un path contiene patrones de path traversal
     */
    static hasPathTraversal(path) {
        if (!path || typeof path !== 'string') {
            return false;
        }

        // Decodificar URL para detectar patrones codificados
        const decodedPath = decodeURIComponent(path);
        const doubleDecodedPath = decodeURIComponent(decodedPath);

        // Verificar patrones de path traversal
        for (const pattern of this.pathTraversalPatterns) {
            if (pattern.test(path) || pattern.test(decodedPath) || pattern.test(doubleDecodedPath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Verifica si un path contiene patrones de sistema
     */
    static hasSystemPatterns(path) {
        if (!path || typeof path !== 'string') {
            return false;
        }

        const decodedPath = decodeURIComponent(path);

        for (const pattern of this.systemPatterns) {
            if (pattern.test(path) || pattern.test(decodedPath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Verifica si un path contiene una extensión sensible
     */
    static hasSensitiveExtension(path) {
        if (!path || typeof path !== 'string') {
            return false;
        }

        const lowerPath = path.toLowerCase();

        // Verificar extensiones sensibles
        for (const ext of this.sensitiveExtensions) {
            if (lowerPath.includes(ext.toLowerCase())) {
                return true;
            }
        }

        return false;
    }

    /**
     * Verifica si un path contiene un directorio prohibido
     */
    static hasForbiddenDirectory(path) {
        if (!path || typeof path !== 'string') {
            return false;
        }

        const lowerPath = path.toLowerCase();

        for (const dir of this.forbiddenDirectories) {
            // Verificar si el path contiene el directorio
            if (lowerPath.includes(`/${dir}/`) || 
                lowerPath.includes(`\\${dir}\\`) ||
                lowerPath.startsWith(`${dir}/`) ||
                lowerPath.startsWith(`${dir}\\`) ||
                lowerPath.endsWith(`/${dir}`) ||
                lowerPath.endsWith(`\\${dir}`)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Verifica si un path es un archivo protegido
     */
    static isProtectedFile(path) {
        if (!path || typeof path !== 'string') {
            return false;
        }

        const lowerPath = path.toLowerCase();

        for (const file of this.protectedFiles) {
            if (lowerPath.includes(file.toLowerCase())) {
                return true;
            }
        }

        return false;
    }

    /**
     * Verifica si un path es seguro
     */
    static isPathSafe(path) {
        if (!path) {
            return true;
        }

        // Verificar path traversal
        if (this.hasPathTraversal(path)) {
            return false;
        }

        // Verificar patrones de sistema
        if (this.hasSystemPatterns(path)) {
            return false;
        }

        // Verificar extensiones sensibles
        if (this.hasSensitiveExtension(path)) {
            return false;
        }

        // Verificar directorios prohibidos
        if (this.hasForbiddenDirectory(path)) {
            return false;
        }

        // Verificar archivos protegidos
        if (this.isProtectedFile(path)) {
            return false;
        }

        return true;
    }

    /**
     * Valida un objeto completo (recursivo para objetos anidados)
     */
    static validateObject(obj, depth = 0) {
        if (depth > 5) {
            return true; // Prevenir recursión infinita
        }

        if (obj === null || obj === undefined) {
            return true;
        }

        if (typeof obj === 'string') {
            return this.isPathSafe(obj);
        }

        if (Array.isArray(obj)) {
            return obj.every(item => this.validateObject(item, depth + 1));
        }

        if (typeof obj === 'object') {
            return Object.values(obj).every(value => this.validateObject(value, depth + 1));
        }

        return true;
    }

    /**
     * Middleware principal
     */
    static middleware() {
        return (req, res, next) => {
            // Validar URL completa
            if (req.originalUrl && !this.isPathSafe(req.originalUrl)) {
                logAction(req, 'warning', 'PathSecurityValidator', 'FORBIDDEN_RESOURCE');
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Access to this resource is not allowed',
                    code: 'FORBIDDEN_RESOURCE'
                });
            }

            // Validar path
            if (req.path && !this.isPathSafe(req.path)) {
                logAction(req, 'warning', 'PathSecurityValidator', 'FORBIDDEN_RESOURCE');
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Access to this resource is not allowed',
                    code: 'FORBIDDEN_RESOURCE'
                });
            }

            // Validar parámetros de ruta
            if (req.params && !this.validateObject(req.params)) {
                logAction(req, 'warning', 'PathSecurityValidator', 'FORBIDDEN_PARAMETER');
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Access to this resource is not allowed',
                    code: 'FORBIDDEN_RESOURCE'
                });
            }

            // Validar query parameters
            if (req.query && !this.validateObject(req.query)) {
                logAction(req, 'warning', 'PathSecurityValidator', 'FORBIDDEN_QUERY');
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Access to this resource is not allowed',
                    code: 'FORBIDDEN_RESOURCE'
                });
            }

            // Validar body (solo campos sospechosos)
            if (req.body && typeof req.body === 'object') {
                const suspiciousFields = ['path', 'file', 'url', 'filename', 'filepath', 'directory'];
                
                for (const field of suspiciousFields) {
                    if (req.body[field] && !this.isPathSafe(req.body[field])) {
                        logAction(req, 'warning', 'PathSecurityValidator', 'FORBIDDEN_FILE_REFERENCE');
                        return res.status(403).json({
                            error: 'Forbidden',
                            message: 'Access to this resource is not allowed',
                            code: 'FORBIDDEN_RESOURCE'
                        });
                    }
                }
            }

            addRequestTraceStep(req, 'PathSecurityValidator', { ok: true });
            next();
        };
    }
}

module.exports = PathSecurityValidator;

