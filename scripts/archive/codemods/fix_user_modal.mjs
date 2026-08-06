import fs from 'fs';
let content = fs.readFileSync('src/components/UserManagementTab.tsx', 'utf8');

const regexModalStates = /const \[draftPermissions, setDraftPermissions\] = useState<Record<string, boolean>>\(\{\}\);/m;
const newStates = `const [draftPermissions, setDraftPermissions] = useState<Record<string, boolean>>({});

  // Add staff modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');`;

content = content.replace(regexModalStates, newStates);

const regexHandleAddStaff = /const handleAddStaff = async \(\) => \{[\s\S]*?console\.log\('added'\);\n    \} catch \(e\) \{\n      alert\('Gagal menambah user.'\);\n    \}\n  \};/m;

// wait, let's just replace the whole handleAddStaff
const regexAddStaffFull = /const handleAddStaff = async \(\) => \{[\s\S]*?Gagal menambah user\.'\);\n    \}\n  \};/;
const newHandleAddStaff = `const handleAddStaffClick = () => {
    setNewStaffName('');
    setNewStaffEmail('');
    setIsAddModalOpen(true);
  };

  const handleSaveNewStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail || !newStaffEmail.includes('@')) {
      alert('Email tidak valid.');
      return;
    }
    
    const emailLower = newStaffEmail.toLowerCase().trim();
    if (users.find(u => u.email === emailLower)) {
      alert('Email sudah terdaftar.');
      return;
    }

    const name = newStaffName.trim() || emailLower.split('@')[0];
    
    try {
      await setDoc(doc(db, 'authorizedUsers', emailLower), {
        email: emailLower,
        displayName: name,
        role: 'staff',
        status: 'aktif',
        permissions: emptyPermissions(),
        createdAt: Timestamp.now()
      });
      setIsAddModalOpen(false);
    } catch (e) {
      alert('Gagal menambah user.');
    }
  };`;

content = content.replace(regexAddStaffFull, newHandleAddStaff);

// fix the button onClick
content = content.replace(/onClick=\{handleAddStaff\}/g, 'onClick={handleAddStaffClick}');

// inject the modal before the final </div>
const modalJSX = `
      {/* MODAL: TAMBAH STAFF */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#0f192d]/55 z-50 flex items-start justify-center p-4 sm:pt-[10vh] overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsAddModalOpen(false); }}>
          <div className="bg-white rounded-[18px] w-full max-w-[400px] shadow-2xl overflow-hidden" onMouseDown={e => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-[#14161a] to-[#363a42] text-white px-6 py-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-['Inter'] font-bold text-[13px]">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold m-0 leading-tight">Tambah Staff Baru</h2>
                  <p className="text-[11.5px] font-['Inter'] text-white/75 m-0 mt-0.5">Berikan akses untuk staff baru</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer flex-none"
              >
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSaveNewStaff}>
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#1c2431] mb-1.5">Nama Lengkap</label>
                  <input 
                    type="text" 
                    value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value)}
                    className="w-full border border-[#e4e9f1] rounded-[9px] px-3.5 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#363a42]/20 focus:border-[#363a42] transition-shadow"
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#1c2431] mb-1.5">Alamat Email (Gmail)</label>
                  <input 
                    type="email" 
                    value={newStaffEmail}
                    onChange={e => setNewStaffEmail(e.target.value)}
                    className="w-full border border-[#e4e9f1] rounded-[9px] px-3.5 py-2.5 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#363a42]/20 focus:border-[#363a42] transition-shadow"
                    placeholder="nama@gmail.com"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-[#e4e9f1] bg-[#f6f8fb]">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-white border border-[#e4e9f1] text-[#5f6b7d] text-[13px] font-semibold rounded-[9px] hover:bg-[#f4f5f6] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-[#363a42] hover:bg-[#22252b] text-white text-[13px] font-bold rounded-[9px] transition-colors cursor-pointer"
                >
                  Tambahkan Staff
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};`;

content = content.replace(/    <\/div>\n  \);\n\};\n?$/m, modalJSX);

fs.writeFileSync('src/components/UserManagementTab.tsx', content);
