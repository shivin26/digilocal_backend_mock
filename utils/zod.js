/**
 * Lightweight Zero-Dependency Schema Validation Engine with Zod-compatible API.
 * Provides string trimming, input sanitization, type coercion, and standardized error formatting.
 */

class ValidationError extends Error {
  constructor(issues) {
    super('Validation Error');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

class StringSchema {
  constructor() {
    this._email = false;
    this._min = null;
    this._max = null;
    this._optional = false;
    this._trim = true;
    this._enum = null;
  }

  optional() {
    this._optional = true;
    return this;
  }

  trim() {
    this._trim = true;
    return this;
  }

  email(msg = 'Invalid email address format') {
    this._email = true;
    this._emailMsg = msg;
    return this;
  }

  min(length, msg) {
    this._min = { length, msg: msg || `Must be at least ${length} characters` };
    return this;
  }

  max(length, msg) {
    this._max = { length, msg: msg || `Must not exceed ${length} characters` };
    return this;
  }

  enum(values, msg) {
    this._enum = { values, msg: msg || `Must be one of: ${values.join(', ')}` };
    return this;
  }

  parse(val, path = '') {
    if (val === undefined || val === null || val === '') {
      if (this._optional) return undefined;
      throw [{ field: path, message: 'Field is required' }];
    }

    if (typeof val !== 'string') {
      throw [{ field: path, message: 'Expected string type' }];
    }

    let clean = this._trim ? sanitizeString(val) : val;

    if (this._enum && !this._enum.values.includes(clean)) {
      throw [{ field: path, message: this._enum.msg }];
    }

    if (this._email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(clean)) {
        throw [{ field: path, message: this._emailMsg }];
      }
    }

    if (this._min && clean.length < this._min.length) {
      throw [{ field: path, message: this._min.msg }];
    }

    if (this._max && clean.length > this._max.length) {
      throw [{ field: path, message: this._max.msg }];
    }

    return clean;
  }
}

class NumberSchema {
  constructor(coerce = false) {
    this._coerce = coerce;
    this._min = null;
    this._max = null;
    this._positive = false;
    this._optional = false;
  }

  optional() {
    this._optional = true;
    return this;
  }

  positive(msg = 'Must be a positive number') {
    this._positive = true;
    this._positiveMsg = msg;
    return this;
  }

  min(val, msg) {
    this._min = { val, msg: msg || `Must be at least ${val}` };
    return this;
  }

  max(val, msg) {
    this._max = { val, msg: msg || `Must not exceed ${val}` };
    return this;
  }

  parse(val, path = '') {
    if (val === undefined || val === null || val === '') {
      if (this._optional) return undefined;
      throw [{ field: path, message: 'Field is required' }];
    }

    let num = val;
    if (this._coerce && typeof val === 'string') {
      num = Number(val);
    }

    if (typeof num !== 'number' || Number.isNaN(num)) {
      throw [{ field: path, message: 'Expected numeric type' }];
    }

    if (this._positive && num <= 0) {
      throw [{ field: path, message: this._positiveMsg }];
    }

    if (this._min && num < this._min.val) {
      throw [{ field: path, message: this._min.msg }];
    }

    if (this._max && num > this._max.val) {
      throw [{ field: path, message: this._max.msg }];
    }

    return num;
  }
}

class BooleanSchema {
  constructor(coerce = false) {
    this._coerce = coerce;
    this._optional = false;
  }

  optional() {
    this._optional = true;
    return this;
  }

  parse(val, path = '') {
    if (val === undefined || val === null || val === '') {
      if (this._optional) return undefined;
      throw [{ field: path, message: 'Field is required' }];
    }

    if (this._coerce) {
      if (val === 'true' || val === '1' || val === 1 || val === true) return true;
      if (val === 'false' || val === '0' || val === 0 || val === false) return false;
    }

    if (typeof val !== 'boolean') {
      throw [{ field: path, message: 'Expected boolean type' }];
    }

    return val;
  }
}

class ArraySchema {
  constructor(elementSchema) {
    this._elementSchema = elementSchema;
    this._min = null;
    this._optional = false;
  }

  optional() {
    this._optional = true;
    return this;
  }

  min(length, msg) {
    this._min = { length, msg: msg || `Array must contain at least ${length} item(s)` };
    return this;
  }

  parse(val, path = '') {
    if (val === undefined || val === null) {
      if (this._optional) return undefined;
      throw [{ field: path, message: 'Field is required' }];
    }

    if (!Array.isArray(val)) {
      throw [{ field: path, message: 'Expected array type' }];
    }

    if (this._min && val.length < this._min.length) {
      throw [{ field: path, message: this._min.msg }];
    }

    const issues = [];
    const parsedArray = val.map((item, idx) => {
      try {
        return this._elementSchema.parse(item, `${path}[${idx}]`);
      } catch (errs) {
        if (Array.isArray(errs)) issues.push(...errs);
        else issues.push({ field: `${path}[${idx}]`, message: errs.message || 'Invalid item' });
      }
    });

    if (issues.length > 0) throw issues;
    return parsedArray;
  }
}

class ObjectSchema {
  constructor(shape) {
    this._shape = shape;
    this._optional = false;
  }

  optional() {
    this._optional = true;
    return this;
  }

  parse(val, path = '') {
    if (val === undefined || val === null) {
      if (this._optional) return undefined;
      throw [{ field: path || 'root', message: 'Expected object payload' }];
    }

    if (typeof val !== 'object' || Array.isArray(val)) {
      throw [{ field: path || 'root', message: 'Expected object type' }];
    }

    const issues = [];
    const result = {};

    for (const [key, schema] of Object.entries(this._shape)) {
      const fieldPath = path ? `${path}.${key}` : key;
      try {
        const parsedVal = schema.parse(val[key], fieldPath);
        if (parsedVal !== undefined) {
          result[key] = parsedVal;
        }
      } catch (errs) {
        if (Array.isArray(errs)) issues.push(...errs);
        else issues.push({ field: fieldPath, message: errs.message || 'Invalid field' });
      }
    }

    if (issues.length > 0) throw issues;
    return result;
  }
}

const z = {
  string: () => new StringSchema(),
  number: () => new NumberSchema(false),
  boolean: () => new BooleanSchema(false),
  array: (schema) => new ArraySchema(schema),
  object: (shape) => new ObjectSchema(shape),
  enum: (values, msg) => new StringSchema().enum(values, msg),
  coerce: {
    number: () => new NumberSchema(true),
    boolean: () => new BooleanSchema(true)
  },
  ValidationError
};

module.exports = z;
