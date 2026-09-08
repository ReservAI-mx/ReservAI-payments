class PaginationManager {
    static GetPagination(page, limit) {
        const offset = (page - 1) * limit;
        return { offset };
    }
}

module.exports = PaginationManager;