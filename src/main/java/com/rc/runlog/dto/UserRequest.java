package com.rc.runlog.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@NoArgsConstructor
@Getter
@Setter
public class UserRequest {
    @NotBlank(message = "Username is required")
    @Size(max = 40, message = "Username must be 40 characters or fewer")
    private String username;
    @NotBlank(message = "Email is required")
    @Email(message = "Enter a valid email address")
    private String email;
    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String password;
}
