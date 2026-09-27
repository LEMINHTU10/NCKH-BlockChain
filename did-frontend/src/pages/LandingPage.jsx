export default function LandingPage({ onSelectRole }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 lg:p-8">
      
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-sm border border-border-ui overflow-hidden flex flex-col md:flex-row relative">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-primary-light to-secondary"></div>
        
        {/* Left Side: Brand & Info */}
        <div className="w-full md:w-5/12 bg-surface-subtle p-8 flex flex-col justify-center border-r border-border-ui relative overflow-hidden">
          <div className="absolute -left-20 -top-20 w-64 h-64 rounded-full bg-blue-100/50 blur-3xl pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white shadow-sm border border-blue-900 mb-2">
              <span className="material-symbols-outlined text-[28px]">verified</span>
            </div>
            
            <h1 className="text-3xl font-bold text-primary tracking-tight">
              Hệ Thống<br />DID Kỹ Thuật Số
            </h1>
            <p className="text-sm text-text-sub leading-relaxed">
              Quản lý và xác thực bằng cấp dựa trên công nghệ Blockchain và Zero-Knowledge Proofs (ZKP).
            </p>
            
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded w-fit">
              <span className="w-2 h-2 rounded-full bg-status-active"></span>
              Bảo mật, minh bạch, phi tập trung
            </div>
          </div>
        </div>

        {/* Right Side: Role Selection */}
        <div className="w-full md:w-7/12 p-8 bg-white flex flex-col justify-center">
          <h2 className="text-xl font-bold text-text-main mb-6">Chọn vai trò của bạn</h2>
          
          <div className="flex flex-col gap-4">
            {/* Issuer Role */}
            <button
              onClick={() => onSelectRole('/issuer')}
              className="group flex items-start text-left gap-4 p-4 rounded-xl border border-border-ui hover:border-primary-light hover:bg-primary-soft transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[24px]">account_balance</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-text-main text-base group-hover:text-primary transition-colors">Cơ sở đào tạo (Issuer)</span>
                <span className="text-xs text-text-sub mt-1">Cấp phát, quản lý và thu hồi văn bằng số cho sinh viên.</span>
              </div>
            </button>

            {/* Holder Role */}
            <button
              onClick={() => onSelectRole('/holder')}
              className="group flex items-start text-left gap-4 p-4 rounded-xl border border-border-ui hover:border-primary-light hover:bg-primary-soft transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[24px]">school</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-text-main text-base group-hover:text-primary transition-colors">Sinh viên (Holder)</span>
                <span className="text-xs text-text-sub mt-1">Lưu trữ văn bằng số trong ví và xuất trình qua mã QR.</span>
              </div>
            </button>

            {/* Verifier Role */}
            <button
              onClick={() => onSelectRole('/verifier')}
              className="group flex items-start text-left gap-4 p-4 rounded-xl border border-border-ui hover:border-primary-light hover:bg-primary-soft transition-all"
            >
              <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[24px]">verified_user</span>
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-text-main text-base group-hover:text-emerald-700 transition-colors">Nhà tuyển dụng (Verifier)</span>
                <span className="text-xs text-text-sub mt-1">Quét mã QR và xác thực tính toàn vẹn của bằng cấp.</span>
              </div>
            </button>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center text-xs text-text-muted">
        <p>W3C DID v1.0 Compliant • Ethereum Smart Contracts</p>
      </div>
    </div>
  );
}
