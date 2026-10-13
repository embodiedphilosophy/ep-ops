# A 900x1400 gradient PNG for the upload/crop tests
import struct, zlib, sys
w, h = 900, 1400
raw = b''.join(b'\x00' + b''.join(bytes([x * 255 // w, y * 255 // h, 120]) for x in range(w)) for y in range(h))
c = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + c(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + c(b'IDAT', zlib.compress(raw)) + c(b'IEND', b''))
