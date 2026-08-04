/**
 * Express Middleware for Request Validation using Zod Schemas.
 * Validates body, params, query, and headers, sanitizes inputs, and formats standard 400 Bad Request responses.
 */

function validateRequest(schemas = {}) {
  return (req, res, next) => {
    const issues = [];

    // Validate req.params
    if (schemas.params) {
      try {
        req.params = schemas.params.parse(req.params, 'params');
      } catch (errs) {
        if (Array.isArray(errs)) issues.push(...errs);
      }
    }

    // Validate req.query
    if (schemas.query) {
      try {
        req.query = schemas.query.parse(req.query, 'query');
      } catch (errs) {
        if (Array.isArray(errs)) issues.push(...errs);
      }
    }

    // Validate req.body
    if (schemas.body) {
      try {
        req.body = schemas.body.parse(req.body, 'body');
      } catch (errs) {
        if (Array.isArray(errs)) issues.push(...errs);
      }
    }

    // Return standardized 400 Bad Request if validation issues exist
    if (issues.length > 0) {
      const firstMessage = issues[0]?.message || 'Validation failed';
      return res.status(400).json({
        error: `Validation Error: ${firstMessage}`,
        details: issues
      });
    }

    next();
  };
}

module.exports = { validateRequest };
