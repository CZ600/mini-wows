import msgpack


def encode(msg: dict) -> bytes:
    return msgpack.packb(msg, use_bin_type=True)


def decode(data: bytes) -> dict:
    return msgpack.unpackb(data, raw=False)
