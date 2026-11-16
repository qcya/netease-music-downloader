package com.muoniumplayer.core.ncm;

/** Desktop host adapter. Never reads hardware serials or the Windows MachineGuid.
 * Original API only needs an opaque installation/device identifier. */
public final class DeviceIdGenerator {
 private static final String ID=java.util.UUID.randomUUID().toString().replace("-","");
 private DeviceIdGenerator(){}
 public static String generate(){return ID;}
}
