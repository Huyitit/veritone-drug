'use strict';

jest.mock('fs', () => ({
  stat: jest.fn(),
  unlink: jest.fn(),
}));

const fs = require('fs');
const EventEmitter = require('events');
const { cleanupMultipartUploads } = require('./expressUtil');

describe('cleanupMultipartUploads', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.stat.mockImplementation((path, cb) => cb(null, { isFile: () => true }));
    fs.unlink.mockImplementation((path, cb) => cb(null));

    res = new EventEmitter();
    res.finished = false;
    res.socket = null;
    req = {};
    next = jest.fn();
  });

  it('unlinks req.file on response finish', () => {
    req.file = { path: '/tmp/upload-single.jpg' };

    cleanupMultipartUploads(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);

    res.emit('finish');

    expect(fs.unlink).toHaveBeenCalledWith('/tmp/upload-single.jpg', expect.any(Function));
  });

  it('unlinks all files from array-form req.files on response finish', () => {
    req.files = [{ path: '/tmp/f1.jpg' }, { path: '/tmp/f2.jpg' }];

    cleanupMultipartUploads(req, res, next);
    res.emit('finish');

    expect(fs.unlink).toHaveBeenCalledTimes(2);
    expect(fs.unlink).toHaveBeenCalledWith('/tmp/f1.jpg', expect.any(Function));
    expect(fs.unlink).toHaveBeenCalledWith('/tmp/f2.jpg', expect.any(Function));
  });

  it('unlinks all files from object-map req.files on response finish', () => {
    req.files = {
      avatar: [{ path: '/tmp/avatar.jpg' }],
      document: [{ path: '/tmp/doc.pdf' }],
    };

    cleanupMultipartUploads(req, res, next);
    res.emit('finish');

    expect(fs.unlink).toHaveBeenCalledTimes(2);
    expect(fs.unlink).toHaveBeenCalledWith('/tmp/avatar.jpg', expect.any(Function));
    expect(fs.unlink).toHaveBeenCalledWith('/tmp/doc.pdf', expect.any(Function));
  });
});
