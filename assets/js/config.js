/* =========================================================
   VELOM CAR — PENGATURAN UTAMA
   Ubah nilai di bawah ini sesuai kebutuhan Anda.
   ========================================================= */
window.VELOM_CONFIG = {
  brand: "VELOM",
  brandFull: "Velom Car",
  tagline: "Kurator Mobil Mewah Indonesia",

  // Nomor WhatsApp (format internasional, tanpa + dan spasi)
  whatsapp: "6287771870730",
  whatsappDisplay: "+62 877-7187-0730",

  // Username Instagram tanpa @ (kosongkan jika belum mau ditampilkan)
  instagram: "velom.car",

  // Alamat website: https://velomcar.github.io
  // Dipakai tombol 🚀 Publish di admin (token tetap diisi manual di admin, TIDAK di sini)
  github: { owner: "VelomCar", repo: "velomcar.github.io", branch: "main" },

  // PIN sederhana untuk membuka halaman admin.html
  // (hanya tirai; keamanan sebenarnya ada di token GitHub yang hanya tersimpan di HP/PC Anda)
  adminPin: "2026",

  // Alasan harga kami di bawah pasaran (tampil di beranda & di setiap unit).
  // Silakan ubah kalimatnya sesuai cara kerja Anda.
  alasanHarga: [
    ["Langsung dari showroom partner", "Unit diambil langsung dari showroom rekanan — tanpa perantara berlapis yang menambah harga."],
    ["Margin tipis, unit cepat jalan", "Kami pilih untung kecil dengan perputaran cepat, bukan menahan unit dengan harga tinggi."],
    ["Hanya unit di bawah pasaran", "Kami hanya menawarkan unit yang harganya sudah kami bandingkan dengan harga pasaran."],
    ["Harga cash, bisa nego", "Harga yang tertera adalah harga cash dan masih bisa dinegosiasikan dengan sopan."],
    ["Kondisi terkurasi", "Spesifikasi, pajak, odometer & riwayat unit ditampilkan apa adanya sesuai data showroom."],
    ["Kirim se-Indonesia", "Unit dapat dikirim ke kota Anda — beli di bawah pasaran tanpa harus datang jauh."]
  ],

  // Model 3D di hero. Bisa diganti file .glb milik Anda sendiri.
  model3d: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/ferrari.glb",
  model3dShadow: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/ferrari_ao.png",
};
